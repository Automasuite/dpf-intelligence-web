# DPF Neon + Clerk Backend Foundation

Status: architecture and API contract approved for implementation planning. This document does not claim that Clerk is connected, that application secrets are configured, or that an API is deployed.

## Architecture boundary

Browser application -> DPF server-side API -> Clerk token verification -> Neon PostgreSQL.

- The browser must never connect directly to Neon.
- The browser must never receive the Neon backend role credential or a database connection string.
- Clerk is the proposed identity provider. Verify every bearer token on the server using Clerk's supported server SDK and the configured Clerk secret/JWKS settings.
- Resolve the authenticated Clerk subject to `core.users.id` on the server. Never accept a client-provided user ID as identity.
- Resolve the requested workspace against active `core.memberships` for that user. Never trust a client-provided organization ID without checking membership.
- Use a single pooled Neon connection strategy suitable for serverless execution. Keep all database calls parameterized.
- For each request, start a database transaction and set `dpf.user_id` and `dpf.org_id` with transaction-local `set_config(..., true)`. Perform tenant-scoped queries in that same transaction, then commit or roll back.
- Do not reuse a connection with session-level identity settings. Transaction-local context prevents identity leaking between pooled requests.
- The GUC values are context, not proof of identity. The API is the trust boundary; only set them after successful Clerk verification and active-membership lookup.
- `dpf_app_backend` is server-only, non-superuser, and must not have BYPASSRLS. Do not use the Neon owner role in application runtime.

## Authentication and workspace flow

1. Client signs in through Clerk and obtains a short-lived session token.
2. Client sends `Authorization: Bearer <session-token>` to the DPF API.
3. API verifies signature, issuer, expiry, authorized party/audience where configured, and token validity using Clerk's server-side verification library.
4. API takes the verified `sub` claim and synchronizes the user through `core.upsert_clerk_user`. Only call this function after token verification.
5. API lists workspaces by joining `core.organizations` to active `core.memberships` for the resolved internal user ID.
6. For a workspace-scoped request, API confirms active membership before opening the tenant-scoped transaction.
7. The API returns only fields required by the current user and workspace.

## Initial API contract

All routes are server-side. JSON errors use a stable shape: `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Do not return SQL errors, stack traces, secrets, raw tokens, or internal database details.

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| GET | `/api/v1/health/live` | None | Process liveness only; no secrets or dependency details |
| GET | `/api/v1/health/ready` | None | Server-side readiness check; return degraded/unavailable if required secrets or DB check fail |
| GET | `/api/v1/me` | Clerk | Return current user profile |
| GET | `/api/v1/workspaces` | Clerk | List active workspaces for the authenticated user |
| POST | `/api/v1/workspaces` | Clerk | Create workspace via `core.create_workspace` |
| GET | `/api/v1/workspaces/:workspaceId/business-profiles` | Clerk + membership | List profiles in selected workspace |
| POST | `/api/v1/workspaces/:workspaceId/business-profiles` | Clerk + membership | Create a business profile with server-derived organization ID |

### Request validation

- Reject unsupported content types, oversized bodies, malformed JSON, invalid UUIDs, and unknown fields where practical.
- Validate country and currency codes, timezone, business name, website URL, and email formats at the API boundary.
- Derive the owner/user identity from the verified token; do not accept `user_id` from the request body.
- Workspace IDs are selectors only; verify active membership before use.
- Apply rate limits to authentication-adjacent, onboarding, and write endpoints.
- Use request IDs, structured redacted logs, and idempotency keys for retryable writes.

## Database access pattern

For a workspace-scoped request:

1. Verify Clerk token.
2. Resolve internal user ID from verified Clerk subject.
3. Verify active membership for the selected workspace.
4. Acquire a connection and begin a transaction.
5. Set transaction-local user and workspace context.
6. Execute parameterized tenant-scoped SQL.
7. Commit; on any error, roll back and release the connection.

Never set identity context at session scope. Never allow the browser to set database context directly.

## Environment variables

Server-side only; never prefix these with `VITE_`:

- `CLERK_SECRET_KEY`: Clerk server secret.
- `CLERK_PUBLISHABLE_KEY`: public Clerk key (may be used by frontend where appropriate).
- `DATABASE_URL`: connection URL for the restricted `dpf_app_backend` role, stored in the hosting provider's encrypted environment/secrets manager.
- `APP_ENV`: development, preview, or production.
- `ALLOWED_ORIGINS`: explicit browser origin allowlist.
- `LOG_LEVEL`: approved structured logging level.

Do not put real values in source control, issues, screenshots, or chat. Do not use the Neon owner connection string for the application.

## Security and operational controls

- Default deny; least privilege; tenant isolation tested on every protected resource.
- CORS allowlist, CSRF protection for cookie-based sessions, secure headers, request size limits, and rate limiting.
- Redact authorization headers, cookies, email addresses, phone numbers, database URLs, and all credentials from logs.
- Add audit events for workspace creation, profile changes, access-sensitive actions, approvals, and administrative operations.
- Health checks must distinguish liveness from readiness and must not reveal secret values.
- Add timeout budgets, bounded retries with jitter for transient upstream failures, and no retries for non-idempotent writes without idempotency.
- Monitor error rate, latency, database connection saturation, failed authentication, RLS denials, and unexpected access patterns.
- Maintain tested backups, restore procedures, migration rollback plans, and an incident/kill-switch procedure.
- Human approval remains required for external messaging, bulk imports, destructive actions, and production automation.

## Acceptance tests before deployment

1. Missing, malformed, expired, or invalid Clerk token returns 401.
2. Valid Clerk identity maps to exactly one internal user record.
3. A user can list only workspaces with active membership.
4. A user cannot read or write another workspace's business profile by substituting its UUID.
5. Missing workspace context exposes no tenant data.
6. Two concurrent requests on pooled connections cannot leak user/workspace context.
7. Backend role is not superuser and does not bypass RLS.
8. Public execution of security-definer helper functions is revoked; only the backend role has required execute grants.
9. SQL injection probes are handled by parameterized statements.
10. Readiness returns degraded/unavailable when database or required configuration is missing, without exposing values.

## Current blockers before implementation/deployment

- Clerk account must be connected/configured by the owner; no Clerk secret or publishable key is available in this repository.
- Hosting environment must be selected/confirmed and configured with the restricted Neon role credential.
- The existing frontend still contains a Supabase client and Supabase environment variables. It must be migrated deliberately to DPF API endpoints in a separate reviewed change; do not remove the current integration until replacement routes and data reads are tested.
- Existing `/api/health` checks configuration-variable presence only; it is not a database readiness probe.
- This document is a design contract, not an implementation or deployment claim.
