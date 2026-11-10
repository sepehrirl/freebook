# FreeBook

FreeBook is a Persian, RTL-first online library with a paper-inspired interface. It uses a static frontend plus Supabase Auth and PostgreSQL.

## Product principles
- Free access only to books whose public-domain status, open license, or redistribution permission is verified.
- Real accounts, not client-only mock authentication.
- Private bookmarks and reading progress protected by PostgreSQL Row Level Security (RLS).
- Responsive and accessible UI.
- No privileged secrets in browser code.

## Current implementation
- Responsive Paper UI catalogue, search and category filters.
- Supabase email/password registration and sign-in.
- Automatic reader profile creation.
- Personal bookmarks and reading progress.
- Reader view for hosted book content.
- Dark mode.
- Server-side automated ingestion of verified, openly licensed PDF/TXT books into a private Supabase Storage bucket.
- Admin-only visibility into ingestion run history; browser-side manual book entry and uploads are disabled.
- PDF page navigation and text reader with saved reading position and resume support.
- Product-wide Paper UI design system for all current and future screens.

## Setup
1. Supabase project is connected in `config.js` using the project URL and a public publishable key.
2. The database migrations are in `supabase/migrations/` and are applied in order:
   - `001_initial_schema.sql`
   - `002_security_hardening.sql`
   - `20261110175008_freebook_phase1_least_privilege.sql`
   - `20261110175133_phase1_policy_and_fk_indexes.sql`
   - `20261110184223_phase3_storage_reader_progress.sql`
   - `20261110201500_phase4_automated_ingestion.sql`
   - `20261110203000_phase4_ingestion_security_cleanup.sql`
3. Never put a `service_role` key, `sb_secret_` key, database password, or SMTP secret in this repository.
4. Configure Supabase Auth site URL and redirect allowlist for the deployed GitHub Pages URL.
5. Configure email confirmation and production SMTP before launch.
6. Configure only reviewed source manifests with verified redistribution rights.
7. The ingestion function publishes a book only after rights, file, host, size, and duplicate checks pass.
8. Enable GitHub Pages for the `main` branch root.

## Promote a trusted account to admin
Create the account through the website first. Then run in Supabase SQL Editor as project owner, replacing the email:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'trusted-admin@example.com');
```

Never expose a service-role key in the browser or repository.

## Data model
- `profiles`: display name and server-controlled role.
- `books`: catalogue metadata and publication/license provenance.
- `bookmarks`: private saved books.
- `reading_progress`: private per-user progress.

Public visitors can read only published books. Users can access only their own profile, bookmarks, and progress. Publishing and catalogue edits require the admin role.

## Release status
This is a product foundation, not completed enterprise certification. Before launch, complete [SECURITY.md](SECURITY.md) and [docs/release-checklist.md](docs/release-checklist.md), configure monitoring and backup restoration, and perform an independent security review.


## Phase 3 — files and reading progress
- Uploads use the private `freebook-books` Storage bucket; only admins can add, replace, or delete files.
- Published book files can be read through Storage row-level policies; the bucket itself remains private.
- Supported direct uploads are PDF and plain text (TXT), up to 50 MB.
- PDF progress stores the last page; TXT progress stores the scroll offset. Progress is saved per account.
- Existing HTTPS-hosted book links remain supported as a fallback.

## Phase 4 — automated book ingestion
- The `ingest-books` Supabase Edge Function runs from Supabase Cron daily.
- It accepts only verified CC0 1.0, CC BY 4.0, and CC BY-SA 4.0 manifest entries. Non-commercial licenses are not included in the automatic allowlist.
- The importer validates HTTPS host allowlists, PDF signatures / UTF-8 TXT, 50 MiB size, SHA-256 duplicates, and source identity before publishing.
- Source feeds are curated and stored server-side in `public.book_ingestion_sources`; browser roles cannot edit them. The admin panel shows recent run history and imported catalogue entries.
- The scheduled job is deployed but imports no books until at least one vetted source manifest is registered. It never guesses that a free-to-read file may be redistributed.
