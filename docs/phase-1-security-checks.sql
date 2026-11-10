-- FreeBook Phase 1 security regression checks
-- Run as postgres in the Supabase SQL Editor after migrations.
do $$
declare
  t text;
begin
  foreach t in array array['profiles','books','bookmarks','reading_progress'] loop
    if not (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t) then
      raise exception 'RLS is not enabled on public.%', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'INSERT')
       or has_table_privilege('anon', format('public.%I', t), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', t), 'DELETE')
       or has_table_privilege('anon', format('public.%I', t), 'TRUNCATE') then
      raise exception 'anon has unexpected write-level privilege on public.%', t;
    end if;
    if has_table_privilege('authenticated', format('public.%I', t), 'TRUNCATE')
       or has_table_privilege('authenticated', format('public.%I', t), 'REFERENCES')
       or has_table_privilege('authenticated', format('public.%I', t), 'TRIGGER') then
      raise exception 'authenticated has unexpected elevated table privilege on public.%', t;
    end if;
  end loop;

  if not has_table_privilege('anon', 'public.books', 'SELECT') then
    raise exception 'anon must be able to read the public catalogue';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'SELECT')
     or has_table_privilege('anon', 'public.bookmarks', 'SELECT')
     or has_table_privilege('anon', 'public.reading_progress', 'SELECT') then
    raise exception 'anon must not read private user tables';
  end if;
  if not has_table_privilege('authenticated', 'public.reading_progress', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.bookmarks', 'INSERT')
     or not has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'Required signed-in user permissions are missing';
  end if;

  if has_schema_privilege('anon', 'private', 'USAGE')
     or not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'private schema usage grants are incorrect';
  end if;
  if has_function_privilege('anon', 'private.is_admin()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'private.is_admin()', 'EXECUTE') then
    raise exception 'private.is_admin execution grants are incorrect';
  end if;
  if has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE') then
    raise exception 'Internal trigger function is exposed to API roles';
  end if;
end;
$$;

-- Review policies and table grants in the query output.
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','books','bookmarks','reading_progress')
order by tablename, policyname;
