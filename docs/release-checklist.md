# Production release checklist

## Product
- [ ] Supabase project configured and migration applied.
- [ ] Auth site URL and redirect allowlist configured.
- [ ] Email confirmation and production SMTP tested.
- [ ] Admin account created and protected with MFA.
- [ ] Real books have verified redistribution rights and attribution.
- [ ] Book files are hosted reliably and tested on mobile.
- [ ] Privacy notice, terms, contact, and takedown process published.

## Security
- [ ] No service-role key or secret in repository history.
- [ ] Anonymous access to unpublished books is denied.
- [ ] User A cannot read or change user B's profile, bookmarks, or progress.
- [ ] A reader cannot create or publish a book.
- [ ] Auth rate limits, abuse controls, and admin MFA reviewed.
- [ ] Storage policies and file type/size restrictions reviewed.
- [ ] Independent security review completed.

## Quality
- [ ] Test current Chrome, Firefox, Safari, and mobile browsers.
- [ ] Test keyboard-only navigation and screen-reader labels.
- [ ] Verify contrast, focus states, and responsive layouts.
- [ ] Test empty, loading, offline, and backend-error states.
- [ ] Verify backup restoration and operational alerts.
- [ ] Confirm performance and accessibility targets with automated tooling.
