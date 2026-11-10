# Phase 4 — automated book ingestion

## Manifest contract

Each enabled source row in `public.book_ingestion_sources` points to an HTTPS JSON manifest with an `items` array. Each item must contain `external_id`, `title`, `author`, `source_url`, `content_url`, `license_code`, `rights_verified: true`, `rights_evidence_url`, and `attribution`. Optional fields: `description`, `category`, `language`, and `cover_url`.

Allowed licenses are intentionally limited to CC0 1.0, CC BY 4.0, and CC BY-SA 4.0. Non-commercial licenses and public-domain assertions without jurisdiction-specific evidence are not auto-published. Content hosts must be listed in the source row's `allowed_content_hosts`.

## Register a source

Only a trusted project operator should add a source. The manifest and its evidence must be reviewed before enabling it. Example SQL (replace values with a reviewed manifest and exact hostnames):

```sql
insert into public.book_ingestion_sources
  (source_key, manifest_url, allowed_content_hosts, enabled, max_items_per_run)
values
  ('verified-oer', 'https://catalog.example.org/freebook.json', array['catalog.example.org','files.example.org'], true, 5);
```

Do not add a source just because its files are free to read. Verify that the exact edition and file may be redistributed under one of the allowlisted licenses, and preserve its attribution.

## Runtime

- Edge Function: `ingest-books`
- Daily schedule: 10:30 UTC via Supabase Cron
- Storage: private `freebook-books` bucket
- File types: PDF and UTF-8 TXT, max 50 MiB
- Duplicate checks: source + external ID and SHA-256
- Public visibility: only after successful upload and all rights/file checks
- Admin visibility: `book_ingestion_runs` read-only through RLS

The function and schedule are deployed independently from the GitHub Pages frontend. A run with no enabled sources is a successful no-op; it does not invent or scrape unverified content.
