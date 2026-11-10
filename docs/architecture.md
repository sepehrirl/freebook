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

## Scaling path
For higher traffic, add a dedicated API for catalogue search and ingestion, object storage/CDN for book files, connection pooling, observability, tested backups, and a moderation workflow. Preserve RLS when adding services.
