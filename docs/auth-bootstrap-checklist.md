# DPF workspace authentication bootstrap checklist

This checklist prepares authentication without provisioning an account or changing live project settings. The first administrator email is intentionally not embedded in source code.

## Application behavior implemented

- The private workspace entry point requires a Supabase Auth session before rendering the workspace.
- Sign-in uses Supabase Auth email/password authentication.
- There is no public sign-up, password reset, or invitation flow in the application.
- Sign-out calls Supabase Auth and returns to the sign-in screen.
- If the public Supabase URL or publishable/anon key is missing, the workspace fails closed and displays a setup message.
- The browser receives only the public project URL and publishable/anon key. Never put a service-role key in a VITE_ variable.
- This gate is a user-experience boundary, not a substitute for server-side authorization. All future private APIs must verify the access token, derive owner identity from the verified token, enforce role permissions and scope every query.

## Supabase dashboard steps — pending approval

1. Confirm the dedicated project is DPF Investor Intelligence (ksjyqrzdcfikgnroceju).
2. In Authentication settings, enable the email provider and configure the intended email-confirmation policy.
3. Disable public user sign-ups. Accounts should be created/invited only by an authorized administrator.
4. Set the production Site URL to the approved DPF workspace domain and add only the exact required redirect URLs. Do not use broad wildcard redirects.
5. Create or invite the first administrator only after the user supplies and confirms the intended email address.
6. Verify the account can sign in and sign out. Do not share credentials in chat or source control.

## Deployment environment variables

Set these only in the approved DPF Vercel project and appropriate environment scope:

- VITE_SUPABASE_URL — dedicated DPF project URL.
- VITE_SUPABASE_ANON_KEY — project publishable/anon key.

The app's existing public catalogue also uses these variables. Confirm the catalogue's access policy before enabling them on the public deployment. The public anon/publishable key is not a secret; database RLS and API authorization are the security boundary.

Never set SUPABASE_SERVICE_ROLE_KEY, database passwords, or other privileged secrets as VITE_ variables. Those secrets belong only in server-side environment variables for protected API functions after those functions have been implemented and reviewed.

## Required tests before opening the workspace

- Missing environment: setup screen is shown; no workspace content renders.
- No session: sign-in screen is shown; no workspace content renders.
- Invalid credentials: generic failure is shown without revealing whether an email exists.
- Valid session: workspace renders.
- Sign-out: session is cleared and workspace is hidden.
- Reload: session is revalidated before workspace renders.
- Expired/revoked session: protected APIs reject the request and client returns to sign-in.
- Public sign-up is disabled in Supabase.
- Two-user tenant-isolation tests pass before any private records are read or written.
- No lead import, contact mutation, messaging, or export is enabled by this authentication gate alone.

## Current state

The sign-in gate is implemented in the isolated feature branch. No administrator account has been created. No Supabase Auth settings or Vercel environment variables have been changed. The Lead Vault migration is still unapplied, and the workspace remains a prototype with session-only lead capture and preview-only CSV processing.
