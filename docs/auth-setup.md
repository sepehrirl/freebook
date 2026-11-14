# FreeBook authentication setup

The browser app uses Supabase Auth email/password with email confirmation enabled. The client sends the current FreeBook page as `emailRedirectTo`, so confirmation and password-reset links return to the deployed page instead of relying on Supabase's default localhost URL.

## Required Supabase Dashboard settings

Complete these steps for the production Supabase project:

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to the exact public FreeBook deployment URL (not localhost).
3. Add the deployed FreeBook URL to **Redirect URLs**. Include the full path used by the site. For GitHub Pages project sites, the path segment matters. If the site is also served from preview/staging URLs, add only those exact trusted origins/paths; do not use a broad wildcard such as `https://**`.
4. Open **Authentication → Sign In / Providers → Email** and keep email confirmations enabled.
5. Keep the standard confirmation email link based on Supabase's `{{ .ConfirmationURL }}`. If a custom template is used, ensure it respects the redirect supplied by the app (Supabase exposes `{{ .RedirectTo }}`); do not hard-code an old or localhost URL.
6. Open **Authentication → SMTP Settings** and configure a verified sender with a production SMTP provider. The built-in Supabase email service is intended for testing, has strict sending limits, and is not suitable for reliable production delivery. Verify the sender domain and SPF/DKIM records with the provider.
7. Open **Authentication → Attack Protection** and review email/OTP rate limits. CAPTCHA is not yet wired into this frontend; only enable a CAPTCHA challenge after its token is integrated into signup and sign-in requests.
8. In password settings, use a minimum length of at least 12 characters for new accounts. Before enforcing a stronger server-side minimum, test existing accounts and provide a password-reset path so older passwords are not unexpectedly rejected. Enable leaked-password protection if the project plan supports it. Require MFA for administrator accounts and protect the administrator email account.

## User flows

- **Sign up:** email + display name + password. Supabase sends a confirmation email. The user returns to the same FreeBook page after clicking the confirmation link.
- **Unconfirmed account:** the login form explains the state and offers a resend-confirmation action.
- **Sign in:** email + password. Supabase validates credentials and restores the session.
- **Forgot password:** sends a reset link back to the same FreeBook page. Supabase emits the `PASSWORD_RECOVERY` event and the app opens the new-password form.
- **Sign out:** revokes the current Supabase session through `auth.signOut()`.

## Important deployment check

The app constructs the redirect from `window.location.origin + window.location.pathname`. After deploying, open FreeBook in the browser and copy the full page URL. Add that exact URL to **Redirect URLs**. Also set **Site URL** to the canonical production home URL. A mismatch is a common reason for confirmation links to land on an unexpected page or fail.

## Security boundaries

- The frontend contains only the public publishable key. Never add a service-role key, secret key, database password, or SMTP credentials to this repository.
- PostgreSQL RLS remains the authorization boundary for profiles, bookmarks, reading progress, and books.
- Admin roles are assigned only by a trusted project owner in Supabase; never from browser metadata or signup form fields.
- Do not disable email confirmation to hide a broken redirect or SMTP configuration. Fix the redirect and mail delivery instead.
