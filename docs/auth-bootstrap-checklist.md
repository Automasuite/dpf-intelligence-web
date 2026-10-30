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

## Server-side session verification

A read-only endpoint has also been added at GET /api/lead-vault/session. It extracts the bearer token, verifies it with Supabase Auth on the server, and returns the authenticated user's ID plus active workspace IDs and roles. It does not return or mutate contact data.

Configure these server-side environment variables in the approved Vercel project before enabling the endpoint:

- SUPABASE_URL — dedicated DPF project URL.
- SUPABASE_ANON_KEY — dedicated project's publishable/anon key.

These values are not privileged credentials. No service-role key is used by this session-verification endpoint. The preview, approval and commit routes use a separate server-only service-role secret and enforce membership/role checks before calling restricted database functions.

## Workspace membership and roles

A second review-only migration, 202610300002_dpf_workspace_membership.sql, adds workspace membership with four roles: owner, admin, operator and reviewer. Contact read policies now require an active membership for the contact's workspace. Suspended or revoked members lose read access. Authenticated users cannot create or modify membership rows directly.

The server auth helper verifies the Supabase token and then reads active membership rows using that user's JWT. The session endpoint returns workspace owner IDs and roles, not contact data. The browser now calls this endpoint before rendering the workspace. Missing migration, missing membership or an unverifiable session fails closed.

No owner membership is seeded yet because the first administrator account has not been created. Once the first account is confirmed and provisioned, a one-time owner membership row must be inserted through an approved administrative process. Staff invitations and membership changes must be performed through a future audited server-side admin route; that route is not implemented yet.

Action-specific server permissions are now defined and tested: owner/admin can approve and commit; reviewer can approve but not commit; operator can preview but cannot approve or commit. APIs for rollback, export, membership administration, permission changes and suppression management remain unimplemented. A role label alone does not authorize a browser-side write.

## Server-only write configuration

The preview, approval and commit API routes use a server-only privileged Supabase client. The following environment values are required only after the API is reviewed and deployed:

- SUPABASE_SERVICE_ROLE_KEY — privileged server credential; never expose in browser code, VITE_ variables, client responses, logs or screenshots.
- LEAD_VAULT_WRITES_ENABLED — must remain unset or false until all activation blockers in the API security contract are cleared. Set to true only after explicit operational approval.

The global write kill switch currently blocks all durable preview, approval and commit operations by default. A configured service-role key alone must not activate writes.

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

The sign-in gate, server session check, workspace membership model and role guards are implemented in the isolated feature branch. Durable preview, approval and commit APIs are also present but remain blocked by the default-off write kill switch. No administrator account has been created. No Supabase Auth settings or Vercel environment variables have been changed. The four Lead Vault migrations remain unapplied, and the browser workspace still uses session-only lead capture and local-only CSV preview.
