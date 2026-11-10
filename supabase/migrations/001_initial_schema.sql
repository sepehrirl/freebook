-- FreeBook initial production schema
-- Run in Supabase SQL Editor. All user-owned rows are protected by RLS.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'کتاب‌خوان',
  role text not null default 'reader' check (role in ('reader', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  author text not null,
  description text not null default '',
  category text not null default 'عمومی',
  language text not null default 'fa',
  cover_url text,
  content_url text,
  license_name text not null,
  license_url text,
  source_url text not null,
  attribution text not null,
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint books_license_required check (length(trim(license_name)) > 0),
  constraint books_source_required check (length(trim(source_url)) > 0),
  constraint books_attribution_required check (length(trim(attribution)) > 0)
);

create table if not exists public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  progress_percent numeric(5,2) not null default 0
    check (progress_percent >= 0 and progress_percent <= 100),
  last_position text,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index if not exists books_published_category_idx
  on public.books (publication_status, category, published_at desc);
create index if not exists books_title_search_idx
  on public.books using gin (to_tsvector('simple', title || ' ' || author));
create index if not exists bookmarks_user_idx on public.bookmarks(user_id);
create index if not exists progress_user_updated_idx
  on public.reading_progress(user_id, updated_at desc);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists books_updated_at on public.books;
create trigger books_updated_at before update on public.books
for each row execute function public.set_updated_at();
drop trigger if exists progress_updated_at on public.reading_progress;
create trigger progress_updated_at before update on public.reading_progress
for each row execute function public.set_updated_at();

-- Create a reader profile automatically for every newly registered account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'کتاب‌خوان')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Role lookup is isolated in a SECURITY DEFINER function to avoid recursive RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.bookmarks enable row level security;
alter table public.reading_progress enable row level security;

create policy "Profiles are readable by their owner"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "Profiles can be updated by their owner"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and role = 'reader');

create policy "Published books are public"
on public.books for select
using (publication_status = 'published' or public.is_admin());
create policy "Admins can create books"
on public.books for insert to authenticated
with check (public.is_admin());
create policy "Admins can update books"
on public.books for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "Admins can remove books"
on public.books for delete to authenticated
using (public.is_admin());

create policy "Users manage only their bookmarks"
on public.bookmarks for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage only their reading progress"
on public.reading_progress for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Supabase grants table access; RLS remains the authorization boundary.
grant usage on schema public to anon, authenticated;
grant select on public.books to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant select, insert, update, delete on public.reading_progress to authenticated;
grant insert, update, delete on public.books to authenticated;
