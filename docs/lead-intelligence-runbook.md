# DPF Lead Intelligence — implementation runbook

## Current components

- Public property catalogue and cinematic landing page: `src/main.jsx`.
- Lead intelligence workspace prototype: `workspace.html`, `src/workspace.jsx`, `src/workspace.css`.
- Additive private-data schema proposal: `supabase/migrations/202610290001_lead_intelligence.sql`.
- Runtime configuration-presence endpoint: `GET /api/health`.

## Important current limitations

1. The workspace prototype keeps manually entered leads in React state only; refresh clears them.
2. The SQL migration is in source control but has not been applied to a database.
3. Supabase project ownership, project health, authentication, and environment variables must be confirmed before connecting customer data.
4. Agent router and CRM integrations are not connected. No leads are being autonomously sourced, messaged, or written to an external CRM.
5. Health endpoint checks configuration-variable presence only. It does not prove that an external service is reachable or authenticated.

## Recommended rollout sequence

1. Confirm the dedicated DPF Supabase project. Do not use KSI Intelligence or any unrelated project.
2. Confirm database health and the intended DPF administrator/authentication model.
3. Review and apply the migration to the dedicated DPF database.
4. Add an authenticated sign-in experience. Keep buyer contact details behind Supabase Auth and row-level security.
5. Connect lead CRUD and follow-up tasks; record important changes in the event log.
6. Add a server-side agent-router adapter. Keep provider API keys in server-side environment variables only; never use a `VITE_*` prefix for secrets.
7. First allow read-only lead discovery and source citation. Deduplicate candidates and require a human to approve imported records.
8. Add qualification summaries and property matching against verified inventory. Show evidence and unresolved checks, not unsupported certainty.
9. Add follow-up suggestions. Human approval is required before sending messages or changing external systems.
10. Add idempotency, rate limits, retries with backoff, timeouts, safe cancellation, audit events, alerts, backups, restore tests, and rollback procedures before production automation.

## Required environment variable names

- `VITE_SUPABASE_URL`: public Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: public/anon key only, protected by RLS and Auth.
- `AGENT_ROUTER_URL`: server-side router base URL.
- `AGENT_ROUTER_API_KEY`: server-side secret; never expose it in browser bundles.
- `DPF_CRM_API_URL`: server-side CRM endpoint, if a CRM is selected.
- `DPF_CRM_API_KEY`: server-side CRM secret.

Only set variables for services that are actually provisioned and tested. The health endpoint returns booleans for integration configuration and never returns secret values.

## Privacy and safety

- Treat phone numbers, names, budgets, motivations, and objections as private personal information.
- Do not collect sensitive personal attributes to score property leads.
- Respect opt-outs and consent, and suppress contact when the record is marked `do_not_contact`.
- Do not scrape behind login walls or bypass site restrictions. Store source URL, retrieval time, and verification status for every externally discovered signal.
- Use source-specific deduplication and human review before importing a discovered person into the CRM.
- Do not allow an agent to claim a property is available, a title is verified, or a price is current without evidence and a timestamp.
- Keep external messaging, data deletion, bulk import, transactions, and production deployment behind explicit approval.
- Maintain least-privilege credentials, row-level security, structured errors, redacted logs, backups, and tested restoration.

## Health check

Open `/api/health`. Expected response is HTTP 200 with `ok: true`. A status of `operational_with_pending_integrations` means the frontend runtime can respond but some integrations are not configured. This endpoint is not a full dependency readiness test.
