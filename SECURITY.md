# Security policy

## Security model
FreeBook uses Supabase Auth for identity and PostgreSQL Row Level Security (RLS) for authorization. The frontend is public and untrusted.

- Only the Supabase publishable/anon key may appear in `config.js`.
- Never commit a service-role key, database password, SMTP credential, or private signing secret.
- RLS is enabled on `profiles`, `books`, `bookmarks`, and `reading_progress`.
- Users can access only their own profile, bookmarks, and reading progress.
- Anonymous visitors can select only published books.
- Book creation, updates, and deletion require the database-side admin check.
- Admin roles must be assigned by a trusted project owner in Supabase SQL Editor.

## Before public launch
1. Follow [docs/auth-setup.md](docs/auth-setup.md) to configure the production Site URL, exact redirect allowlist, email confirmation, and verified SMTP sender.
2. Set a minimum 12-character password policy, enable leaked-password protection when available, and require MFA for administrators.
3. Configure auth rate limits and abuse protection; consider CAPTCHA for public signup.
4. Review logs and alert on unusual authentication/database activity.
5. Configure automated backups and test a restore.
6. Validate book files and restrict storage writes to trusted admins.
7. Keep dependencies updated and review security advisories.
8. Complete an independent security review.

## Reporting
Do not publish exploitable details in a public issue. Contact the repository owner privately with reproduction steps and impact.

## Known limitations
This repository does not yet include a full monitoring stack, formal penetration-test report, enforced MFA, automated backup verification, or a complete admin dashboard. Do not describe it as security-certified until those controls are implemented and independently verified.
