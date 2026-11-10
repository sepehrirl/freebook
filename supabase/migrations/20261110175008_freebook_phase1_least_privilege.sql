-- FreeBook Phase 1: least-privilege Data API grants
-- RLS policies remain the row-level authorization layer; grants limit which roles can reach each table.

revoke all privileges on table
  public.profiles,
  public.books,
  public.bookmarks,
  public.reading_progress
from anon, authenticated;

grant select on table public.books to anon;
grant select, insert, update, delete on table public.books to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, delete on table public.bookmarks to authenticated;
grant select, insert, update, delete on table public.reading_progress to authenticated;

drop policy if exists "Published books are public" on public.books;
drop policy if exists "Admins can read all books" on public.books;

create policy "Published books are public"
on public.books for select
to anon, authenticated
using (publication_status = 'published');

create policy "Admins can read all books"
on public.books for select
to authenticated
using (private.is_admin());

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;

grant usage on schema public to anon, authenticated;
revoke create on schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
