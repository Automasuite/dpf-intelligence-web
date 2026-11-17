# Backend implementation status

## Implemented on the feature branch

- Bearer-token extraction and Clerk JWT verification using the official `@clerk/backend` SDK.
- Fail-closed behavior when Clerk secret or authorized-party configuration is absent.
- Distinct handling for invalid session tokens versus Clerk Backend API lookup outages.
- A shared PostgreSQL pool using server-only `DATABASE_URL`.
- Transaction-local tenant context helper. Tenant context is applied inside a transaction and is not retained on pooled connections.
- Liveness and readiness endpoints. Readiness reports Clerk configuration presence, not live Clerk API availability.
- Authenticated `GET /api/v1/me`, which maps the verified Clerk subject through `core.upsert_clerk_user`.
- Authenticated workspace list/create routes and tenant-scoped business-profile list/create routes.

## Environment variables

- `CLERK_SECRET_KEY` — server only.
- `CLERK_AUTHORIZED_PARTIES` — comma-separated exact frontend origins; required before authenticated routes can operate.
- `DATABASE_URL` — server-only Neon connection string using the restricted `dpf_app_backend` role, never the Neon owner credential.
- `DB_POOL_MAX` — optional, defaults to 5.
- `DATABASE_SSL` — optional; TLS verification remains enabled unless explicitly set to `disable`. Do not disable in production.

No secret values belong in source control or any `VITE_*` variable.

## Current integration blocker

The main Neon schema still uses one-character fields for country and currency codes, while the API validates ISO-style two- and three-character values. A corrected migration was tested on a temporary branch but was not applied to main because explicit approval is still required. Until the schema correction is approved and applied, workspace creation and business-profile integration must be treated as blocked. Do not work around this by truncating country or currency values.

## Verification still required

- Install dependencies and run the Vite build plus API unit/integration tests in the target Node runtime.
- Test valid, expired, malformed, and wrong-origin Clerk tokens.
- Test missing configuration and Clerk/Neon outage behavior.
- Verify that `DATABASE_URL` authenticates as `dpf_app_backend` and that tenant isolation holds for real API transactions.
- Add rate limiting, request IDs, structured redacted logging, and alerting before public production use.

No provider has been connected, no production secrets have been configured, no deployment has occurred, and no pull request has been merged.
