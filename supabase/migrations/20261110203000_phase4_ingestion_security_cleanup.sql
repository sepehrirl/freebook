-- FreeBook Phase 4 follow-up: explicit deny policies for browser roles
drop policy if exists "Block browser access to ingestion sources" on public.book_ingestion_sources;
create policy "Block browser access to ingestion sources"
on public.book_ingestion_sources for all to anon, authenticated
using (false) with check (false);

drop policy if exists "Block browser access to ingestion guard" on public.book_ingestion_guard;
create policy "Block browser access to ingestion guard"
on public.book_ingestion_guard for all to anon, authenticated
using (false) with check (false);
