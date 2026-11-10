# Architecture

## System boundaries
```text
Browser: static UI (GitHub Pages)
  ├── Supabase Auth client
  └── Supabase data client
          |
          v
      Supabase project
       ├── Auth users
       └── PostgreSQL + RLS
            ├── profiles
            ├── books
            ├── bookmarks
            └── reading_progress
```

GitHub Pages serves static assets only. Supabase provides identity and database services.

## Trust boundaries
- Browser input and local storage are untrusted.
- The publishable key is public; RLS is the authorization boundary.
- Privileged credentials stay in trusted server-side environments or the Supabase dashboard.
- Only trusted admins may publish catalogue entries.
- Every book needs source, license, and attribution provenance.

## Main flows
### Registration
1. Browser sends email, password, and display-name metadata to Supabase Auth.
2. Supabase creates the auth user.
3. A database trigger creates a reader profile.
4. Email confirmation is controlled by Supabase Auth settings.

### Reading
1. The catalogue queries published books.
2. PostgreSQL RLS independently enforces publication status.
3. A hosted book file is displayed in the reader view.

### Personal library
1. Bookmark and progress rows include the authenticated user ID.
2. RLS checks `auth.uid()` on every read/write.
3. Changing browser requests cannot grant access to another user's rows.

## Phase 4: automated ingestion
Supabase Cron invokes the private `ingest-books` Edge Function daily. The function validates a Vault-backed token, reads only enabled curated source manifests, and imports only explicitly rights-verified CC0 / CC BY / CC BY-SA records. It downloads PDF or UTF-8 TXT files, checks host allowlists, size, MIME/signature, hashes, and duplicate identity, then uploads to the private Storage bucket and publishes the matching catalogue row. Browser roles cannot manage source feeds or invoke ingestion. Admins can read run summaries only.

## Scaling path
Add observability, tested backups, a source review workflow, and a browser-based reader integration test suite. Preserve RLS and server-side secrets.
