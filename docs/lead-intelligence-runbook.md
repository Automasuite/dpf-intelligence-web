# DPF Lead Intelligence — implementation runbook

## Current components

- Public property catalogue and cinematic landing page: `src/main.jsx`.
- Lead intelligence workspace prototype: `workspace.html`, `src/workspace.jsx`, `src/workspace.css`.
- Additive private-data schema proposal: `supabase/migrations/202610290001_lead_intelligence.sql`.
- Runtime configuration-presence endpoint: `GET /api/health`.

## Verified foundation state — 2026-10-30

- Dedicated Supabase project: `DPF Investor Intelligence` (`ksjyqrzdcfikgnroceju`), region `eu-central-1`, status `ACTIVE_HEALTHY`.
- Applied migrations: `dpf_lead_intelligence_foundation`, `dpf_hardening_and_fk_indexes`, `dpf_privilege_minimization`, and `dpf_workspace_membership`.
- Private tables created with RLS: `dpf_leads`, `dpf_lead_events`, `dpf_follow_up_tasks`, `dpf_agent_runs`, and `dpf_workspace_members`.
- Explicit Data API grants are least-privilege; anonymous table access is disabled. Authenticated users can read only their workspace membership; agent-run lifecycle writes are server-side only.
- Security advisor returned no findings. Foreign-key indexes are installed; unused-index notices are expected while tables are empty.
- Auth user count is currently zero. No administrator account or owner membership has been provisioned yet.

## Important current limitations

1. The workspace prototype keeps manually entered leads in React state only; refresh clears them. Database CRUD is not yet wired into the UI.
2. The workspace membership table exists, but the first administrator account and owner membership still need to be provisioned.
3. The frontend and server-side Supabase environment variables must be configured in the DPF deployment and verified.
4. Agent router and CRM integrations are not connected. No leads are being autonomously sourced, messaged, or written to an external CRM.
5. Health endpoint checks configuration-variable presence only. It does not prove that an external service is reachable or authenticated.

## Recommended rollout sequence

1. Completed: confirm the dedicated DPF Supabase project and its health. Do not use KSI Intelligence or any unrelated project.
2. Completed: apply and verify the private schema, ownership policies, least-privilege grants, workspace membership table, and foreign-key indexes.
3. Provision one administrator through Supabase Authentication using the dashboard's supported user-creation flow. Never insert directly into `auth.users` or collect the administrator's password in chat.
4. Add that user's owner membership with `owner_id = user_id = auth.users.id`, role `owner`, and status `active`. Keep membership writes server-side/admin-only.
5. Configure and verify the frontend public Supabase URL/key and server-side `SUPABASE_URL` / `SUPABASE_ANON_KEY` in the DPF deployment.
6. Verify sign-in and the `GET /api/lead-vault/session` membership check before connecting buyer records.
7. Connect lead CRUD and follow-up tasks; record important changes in the event log. Keep audit events append-only from the browser.
8. Add a server-side agent-router adapter. Keep provider API keys in server-side environment variables only; never use a `VITE_*` prefix for secrets.
9. First allow read-only lead discovery and source citation. Deduplicate candidates and require a human to approve imported records.
10. Add qualification summaries and property matching against verified inventory. Show evidence and unresolved checks, not unsupported certainty.
11. Add follow-up suggestions. Human approval is required before sending messages or changing external systems.
12. Add idempotency, rate limits, retries with backoff, timeouts, safe cancellation, audit events, alerts, backups, restore tests, and rollback procedures before production automation.

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
