# DPF Lead Intelligence — implementation runbook

## Current components

- Public property catalogue and landing page: `src/main.jsx`.
- Private workspace: `workspace.html`, `src/workspace.jsx`, `src/workspace.css`.
- Authentication/session endpoint: `api/lead-vault/session.js`.
- Owner-scoped lead collection API (GET/POST): `api/lead-vault/leads/index.js`.
- Server-side Supabase clients: `api/_lib/auth.js`, `api/_lib/admin-client.js`.
- Runtime configuration-presence endpoint: `GET /api/health`.

## Verified foundation state — 2026-10-30

- Dedicated Supabase project: `DPF Investor Intelligence` (`ksjyqrzdcfikgnroceju`), region `eu-central-1`, status `ACTIVE_HEALTHY`.
- Applied migrations: `dpf_lead_intelligence_foundation`, `dpf_hardening_and_fk_indexes`, `dpf_privilege_minimization`, and `dpf_workspace_membership`.
- Private tables with RLS: `dpf_leads`, `dpf_lead_events`, `dpf_follow_up_tasks`, `dpf_agent_runs`, and `dpf_workspace_members`.
- Explicit Data API grants are least-privilege; anonymous table access is disabled. Authenticated users can read their own workspace membership; agent-run lifecycle writes are server-side only. Browser-created audit events are restricted to human actions and are append-only.
- Security advisor returned no findings. Foreign-key indexes are installed; unused-index notices are expected while tables are empty.
- Initial administrator Auth user has been verified by UUID, and an active `owner` membership has been inserted and independently queried in `dpf_workspace_members`.
- No contact records have been imported. No lead CRUD writes have been made.

## Current limitations and verified code findings

1. The workspace prototype keeps manually entered leads in React state only; refresh clears them. Database CRUD is not wired into the UI.
2. `GET /api/lead-vault/session` validates the bearer token with Supabase Auth and requires at least one active workspace membership. The initial owner membership now exists; end-to-end sign-in still needs a deployed runtime and configured environment.
3. Frontend and server-side Supabase environment variables have not yet been verified in the correct deployment.
4. `api/lead-vault/batches/preview.js` calls the privileged RPC `dpf_create_contact_import_batch`. That RPC and the legacy import tables are absent from the live database. The route also fails closed unless `LEAD_VAULT_WRITES_ENABLED=true`.
5. The older import migrations in the repository are not part of the four applied foundation migrations and must not be applied blindly. Reconcile their schema, constraints, security model, and tests against the live foundation before enabling imports.
6. `api/_lib/admin-client.js` requires server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The session verifier instead uses `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Never expose the service-role key in browser code or any `VITE_*` variable.
7. Agent router and CRM integrations are not connected. No leads are being autonomously sourced, messaged, or written to an external CRM.
8. `GET /api/health` reports configuration-variable presence only; it does not prove external reachability or authentication.
9. The exact Vercel project/deployment for this repository has not yet been identified. Do not change Vercel settings or deploy to a similarly named project until repository linkage and deployment ownership are verified.

## Recommended rollout sequence

1. Completed: confirm the dedicated DPF Supabase project and its health. Do not use KSI Intelligence or any unrelated project.
2. Completed: apply and verify the private schema, ownership policies, least-privilege grants, workspace membership table, and foreign-key indexes.
3. Completed: provision the initial administrator through Supabase Authentication and verify its active owner membership.
4. Pending: identify the exact Vercel project linked to this repository and verify its production/preview branch configuration. Do not guess based on project name.
5. Pending: configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` only in the verified DPF deployment. Configure `SUPABASE_SERVICE_ROLE_KEY` only if a reviewed server-side route needs it; keep it server-only.
6. Pending: verify deployed `GET /api/health`, administrator sign-in, and `GET /api/lead-vault/session` using a real session. Do not ask the user to share passwords, access tokens, or secret keys.
7. In progress: connect the owner-scoped lead collection API to the UI; implement update/archive operations and follow-up task APIs; execute the route and permission test suite against the deployed runtime. Derive actor and owner IDs from verified session membership, not caller-supplied identity. Add append-only human-action audit events.
8. Pending: reconcile the import pipeline with the current foundation; add missing schema only through a reviewed additive migration, tests, idempotency, row limits, duplicate handling, and approval workflow. Keep imports disabled until preview and commit tests pass.
9. Pending: add a server-side agent-router adapter. Keep provider API keys in server-side environment variables only; never use a `VITE_*` prefix for secrets.
10. Pending: first allow read-only lead discovery and source citation. Deduplicate candidates and require a human to approve imported records.
11. Pending: add qualification summaries and property matching against verified inventory. Show evidence and unresolved checks, not unsupported certainty.
12. Pending: add follow-up suggestions. Human approval is required before sending messages or changing external systems.
13. Before production automation: add idempotency, rate limits, retries with backoff, timeouts, safe cancellation, structured/redacted logs, alerts, backups, restore tests, rollback procedures, capacity monitoring, and a documented kill switch.

## Required environment variable names

Public browser configuration:
- `VITE_SUPABASE_URL`: public Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: public/anon key only, protected by RLS and Auth.

Server-only configuration:
- `SUPABASE_URL`: dedicated DPF Supabase project URL.
- `SUPABASE_ANON_KEY`: anon key used by server-side token verification.
- `SUPABASE_SERVICE_ROLE_KEY`: privileged key used only by reviewed server-side routes; never expose to the browser.
- `LEAD_VAULT_WRITES_ENABLED`: explicit feature gate; keep unset/false until the import pipeline is reconciled and tested.
- `AGENT_ROUTER_URL`, `AGENT_ROUTER_API_KEY`: only after the router is provisioned and tested.
- `DPF_CRM_API_URL`, `DPF_CRM_API_KEY`: only after a CRM is selected and tested.

Only set variables for services that are actually provisioned and tested. The health endpoint returns booleans for selected integration configuration and never returns secret values. Review its checks against the actual variables above before treating it as a readiness probe.

## Privacy and safety

- Treat phone numbers, names, budgets, motivations, objections, and contact history as private personal information.
- Do not collect sensitive personal attributes to score property leads.
- Track consent/permission separately from phone validity. Respect opt-outs and suppress contact when a record is marked `do_not_contact`.
- Do not facilitate unsolicited bulk messaging or WhatsApp anti-spam circumvention.
- Do not scrape behind login walls or bypass site restrictions. Store source URL, retrieval time, and verification status for every externally discovered signal.
- Use source-specific deduplication and human review before importing a discovered person into the CRM.
- Do not allow an agent to claim a property is available, a title is verified, or a price is current without evidence and a timestamp.
- Keep external messaging, data deletion, bulk import, transactions, and production deployment behind explicit approval.
- Maintain least-privilege credentials, row-level security, structured errors, redacted logs, backups, and tested restoration.

## Health check

Open `/api/health`. Expected response is HTTP 200 with `ok: true`. A status of `operational_with_pending_integrations` means the runtime responded but some configured checks are false. This endpoint is not a full dependency readiness test and must not be treated as proof that authentication or the database is reachable.
