-- FreeBook Phase 3: private book file storage and resumable reader progress
alter table public.books
  add column if not exists content_path text,
  add column if not exists content_mime_type text,
  add column if not exists content_size_bytes bigint;

alter table public.books
  add constraint books_content_size_nonnegative
  check (content_size_bytes is null or content_size_bytes between 0 and 52428800);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('freebook-books', 'freebook-books', false, 52428800, array['application/pdf', 'text/plain']::text[])
on conflict (id) do update
set public = false, file_size_limit = 52428800,
    allowed_mime_types = array['application/pdf', 'text/plain']::text[];

drop policy if exists "FreeBook admins upload book files" on storage.objects;
create policy "FreeBook admins upload book files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'freebook-books'
  and private.is_admin()
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and exists (select 1 from public.books b where b.id::text = (storage.foldername(name))[1])
);

drop policy if exists "FreeBook published files are readable" on storage.objects;
create policy "FreeBook published files are readable"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'freebook-books'
  and (
    private.is_admin()
    or exists (
      select 1 from public.books b
      where b.content_path = storage.objects.name
        and b.publication_status = 'published'
    )
  )
);

drop policy if exists "FreeBook admins update book files" on storage.objects;
create policy "FreeBook admins update book files"
on storage.objects for update to authenticated
using (bucket_id = 'freebook-books' and private.is_admin())
with check (bucket_id = 'freebook-books' and private.is_admin());

drop policy if exists "FreeBook admins delete book files" on storage.objects;
create policy "FreeBook admins delete book files"
on storage.objects for delete to authenticated
using (bucket_id = 'freebook-books' and private.is_admin());

comment on column public.books.content_path is 'Path to a private Storage object in the freebook-books bucket.';
comment on column public.reading_progress.last_position is 'JSON-encoded reader location, e.g. PDF page or plain-text scroll offset.';
