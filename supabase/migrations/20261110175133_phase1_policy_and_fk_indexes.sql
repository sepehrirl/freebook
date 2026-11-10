-- FreeBook Phase 1 follow-up: avoid duplicate permissive SELECT policies
-- and cover both book_id foreign keys with indexes.

drop policy if exists "Published books are public" on public.books;
drop policy if exists "Admins can read all books" on public.books;

create policy "Published books are public"
on public.books for select
to anon
using (publication_status = 'published');

create policy "Authenticated readers and admins can read books"
on public.books for select
to authenticated
using (publication_status = 'published' or private.is_admin());

create index if not exists bookmarks_book_id_idx
  on public.bookmarks(book_id);

create index if not exists reading_progress_book_id_idx
  on public.reading_progress(book_id);
