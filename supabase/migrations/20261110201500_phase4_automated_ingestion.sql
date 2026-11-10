-- FreeBook Phase 4: automated, rights-gated book ingestion
create extension if not exists pg_cron;
create extension if not exists pg_net;
alter table public.books
  add column if not exists ingestion_source_key text,
  add column if not exists ingestion_external_id text,
  add column if not exists content_sha256 text;

create unique index if not exists books_ingestion_identity_uidx
  on public.books (ingestion_source_key, ingestion_external_id)
  where ingestion_source_key is not null and ingestion_external_id is not null;

create unique index if not exists books_content_sha256_uidx
  on public.books (content_sha256)
  where content_sha256 is not null;

create table if not exists public.book_ingestion_sources (
  source_key text primary key check (source_key ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  manifest_url text not null check (manifest_url ~ '^https://'),
  allowed_content_hosts text[] not null default '{}',
  enabled boolean not null default false,
  max_items_per_run integer not null default 5 check (max_items_per_run between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_key text,
  status text not null check (status in ('running','completed','partial','failed','skipped')),
  discovered_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.book_ingestion_guard (
  singleton boolean primary key default true check (singleton),
  token_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.book_ingestion_sources enable row level security;
alter table public.book_ingestion_runs enable row level security;
alter table public.book_ingestion_guard enable row level security;

revoke all on public.book_ingestion_sources from anon, authenticated;
revoke all on public.book_ingestion_guard from anon, authenticated;
revoke all on public.book_ingestion_runs from anon, authenticated;
grant select on public.book_ingestion_runs to authenticated;
grant all on public.book_ingestion_sources, public.book_ingestion_runs, public.book_ingestion_guard to service_role;

drop policy if exists "FreeBook admins read ingestion runs" on public.book_ingestion_runs;
create policy "FreeBook admins read ingestion runs"
on public.book_ingestion_runs for select to authenticated
using (private.is_admin());

-- A one-time random token is stored only as a hash in the database and as a
-- Vault secret for the scheduled caller. The Edge Function validates its hash.
do $$
declare
  generated_token text;
begin
  if not exists (select 1 from public.book_ingestion_guard where singleton = true) then
    generated_token := encode(gen_random_bytes(32), 'hex');
    insert into public.book_ingestion_guard(singleton, token_hash)
    values (true, encode(digest(generated_token, 'sha256'), 'hex'));
    perform vault.create_secret(
      generated_token,
      'freebook_ingestion_cron_token',
      'Private token used only by the scheduled FreeBook ingestion job'
    );
  end if;
end;
$$;

-- Replace a prior job with the same name without affecting unrelated jobs.
do $$
declare
  existing_job record;
begin
  for existing_job in select jobid from cron.job where jobname = 'freebook-book-ingestion-daily'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'freebook-book-ingestion-daily',
  '30 10 * * *',
  $job$
    select net.http_post(
      url := 'https://jxtzapckfudtdmptgcvi.supabase.co/functions/v1/ingest-books',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-freebook-ingestion-token',
        (select decrypted_secret from vault.decrypted_secrets where name = 'freebook_ingestion_cron_token')
      ),
      body := jsonb_build_object('trigger', 'schedule'),
      timeout_milliseconds := 10000
    );
  $job$
);
