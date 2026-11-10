-- FreeBook Phase 1: least-privilege Data API grants
-- RLS policies remain the row-level authorization layer; grants limit which roles can reach each table.

revoke all privileges on table
  public.profiles,
  public.books,
  public.bookmarks,
  public.reading_progress
from anon, authenticated;

-- Public visitors may only read the published catalogue.
grant select on table public.books to anon;

-- Signed-in readers may read books; writes remain RLS-gated to admins.
grant select, insert, update, delete on table public.books to authenticated;

-- Profile creation is trigger-controlled; users can read/update their own profile.
grant select, update on table public.profiles to authenticated;

-- Bookmarks are created and removed, not edited in place.
grant select, insert, delete on table public.bookmarks to authenticated;

-- Progress supports upsert, requiring SELECT, INSERT and UPDATE.
grant select, insert, update, delete on table public.reading_progress to authenticated;

-- Split public catalogue visibility from admin access.
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

-- Only authenticated users need the private admin helper.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- Trigger functions are not client-callable RPC endpoints.
revoke execute on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;

-- Keep the API schema usable, but prevent client schema creation.
grant usage on schema public to anon, authenticated;
revoke create on schema public from public, anon, authenticated;

-- New public-schema objects must opt in to browser/API permissions explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
