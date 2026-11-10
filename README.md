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
- Database migrations with RLS and admin-only publishing rules.

## Setup
1. Supabase project is connected in `config.js` using the project URL and a public publishable key.
2. The database migrations are in `supabase/migrations/` and are applied in order:
   - `001_initial_schema.sql`
   - `002_security_hardening.sql`
3. Never put a `service_role` key, `sb_secret_` key, database password, or SMTP secret in this repository.
4. Configure Supabase Auth site URL and redirect allowlist for the deployed GitHub Pages URL.
5. Configure email confirmation and production SMTP before launch.
6. Publish only books with verified redistribution rights. Every book must include `license_name`, `source_url`, and `attribution`.
7. Set `publication_status = 'published'` only after rights and file checks.
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
