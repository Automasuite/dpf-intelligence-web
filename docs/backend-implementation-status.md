# Backend implementation status

## Implemented on the feature branch

- Bearer-token extraction and Clerk JWT verification using the official `@clerk/backend` SDK.
- Fail-closed behavior when Clerk or Neon configuration is absent.
- A shared PostgreSQL pool using server-only `DATABASE_URL`.
- Transaction-local tenant context helper. Tenant context is applied inside a transaction and is not retained on pooled connections.
- Liveness and readiness endpoints.
- Authenticated `GET /api/v1/me`, which maps the verified Clerk subject through `core.upsert_clerk_user`.

## Environment variables

- `CLERK_SECRET_KEY` — server only.
- `CLERK_AUTHORIZED_PARTIES` — comma-separated exact frontend origins; configure before enabling production traffic.
- `DATABASE_URL` — server-only Neon connection string using the restricted `dpf_app_backend` role, never the Neon owner credential.
- `DB_POOL_MAX` — optional, defaults to 5.
- `DATABASE_SSL` — optional; TLS verification remains enabled unless explicitly set to `disable`. Do not disable in production.

No secret values belong in source control or any `VITE_*` variable.

## Deliberate limitations

Workspace and business-profile routes are not yet enabled. Their SQL must be aligned against the exact deployed main-branch schema and tested under tenant context before being exposed. The frontend's legacy Supabase catalogue is unchanged. No provider has been connected, no production secrets have been configured, and no deployment has occurred.

## Verification still required

- Install dependencies and run the Vite build plus API unit/integration tests in the target Node runtime.
- Test valid, expired, malformed, and wrong-origin Clerk tokens.
- Test missing configuration and database outage behavior.
- Verify that `DATABASE_URL` authenticates as `dpf_app_backend` and that tenant isolation holds for real API transactions.
- Add rate limiting, request IDs, structured redacted logging, and alerting before public production use.
