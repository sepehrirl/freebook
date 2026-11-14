# Phase 4 — automated book ingestion

## Manifest contract

Each enabled source row in `public.book_ingestion_sources` points to an HTTPS JSON manifest with an `items` array. Each item must contain `external_id`, `title`, `author`, `source_url`, `content_url`, `license_code`, `rights_verified: true`, `rights_evidence_url`, and `attribution`. Optional fields: `description`, `category`, `language`, and `cover_url`.

The current allowlist includes exact, versioned CC BY, CC BY-SA, and GNU FDL licenses. It excludes CC BY-NC, CC BY-NC-SA, NoDerivatives, and unverified public-domain claims. Every candidate must have a source page and a separate evidence URL that states the redistribution license for the exact edition. Content hosts, source hosts, evidence hosts, and final redirect hosts must all be explicitly allowlisted.

## First curated seed

`catalog/manifest.json` contains 20 English STEM titles across mathematics, physics, computer science, and engineering. Each entry has a direct PDF URL, author/title attribution, exact license identifier, source page, and rights-evidence URL. The original PDF is preserved unchanged so its page-level credits and license notices remain intact.

## Runtime

- Edge Function: `ingest-books`
- Daily schedule: 10:30 UTC via Supabase Cron
- Storage: private `freebook-books` bucket
- File types: PDF, max 50 MiB
- Duplicate checks: source + external ID and SHA-256
- New imports per scheduled run: up to five
- Existing imported records do not consume the per-run download quota
- Public visibility: only after successful upload and all rights/file checks
- Audit trail: `books.rights_evidence_url` plus the manifest's source metadata
- Admin visibility: `book_ingestion_runs` read-only through RLS

The function and schedule are deployed independently from the GitHub Pages frontend. A successful run with zero imports is not reported as a successful book upload. Each title is considered imported only after its database row is published and its private Storage object is present.
