-- FreeBook security hardening
-- Keep the SECURITY DEFINER admin helper outside exposed API schemas.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
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
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

drop policy if exists "Published books are public" on public.books;
drop policy if exists "Admins can create books" on public.books;
drop policy if exists "Admins can update books" on public.books;
drop policy if exists "Admins can remove books" on public.books;

create policy "Published books are public"
on public.books for select
using (publication_status = 'published' or private.is_admin());
create policy "Admins can create books"
on public.books for insert to authenticated
with check (private.is_admin());
create policy "Admins can update books"
on public.books for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy "Admins can remove books"
on public.books for delete to authenticated
using (private.is_admin());

drop function if exists public.is_admin();

-- Harden an existing helper if present; it is not part of the client API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;
