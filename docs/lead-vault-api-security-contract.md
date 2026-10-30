# DPF Lead Vault — server API and security contract

## Status

Design contract only. No API routes in this document are implemented or live. The current workspace is a browser-only prototype; manual lead capture remains in React state and the CSV importer remains preview-only. The DPF Supabase project exists, but its Lead Vault migration has not been applied.

## Trust boundaries

- Browser code is untrusted. It may parse a CSV for preview and display data returned by authorized APIs, but it must never decide owner identity, approve imports, merge contacts, set consent, bypass suppression, or write directly to Lead Vault tables.
- Every API request must authenticate the caller with Supabase Auth and derive owner_id from the verified user identity. Ignore any owner ID supplied in request bodies or query strings.
- The server may use the Supabase service-role key for narrowly scoped writes only after authentication, authorization, validation, rate limiting and audit preparation. The key must exist only in server-side environment variables; never use a VITE_ prefix for it.
- Public catalogue access and private Lead Vault access are separate authorization domains. Do not expose contact records through public catalogue queries.
- No agent or automation may send messages, export contacts, change permission, or lift a suppression without a separately authorized action and auditable human approval.

## Proposed endpoints

All endpoints are same-origin /api/lead-vault/*, require HTTPS and a verified Supabase access token, and return Cache-Control: no-store.

| Method and route | Purpose | Required controls |
|---|---|---|
| POST /api/lead-vault/batches/preview | Create a durable batch and validate rows | Authenticated owner, 5 MB / 10,000 row / 50 column caps, explicit country context, server-side revalidation, idempotency key |
| GET /api/lead-vault/batches/:id | Read batch status and counts | Owner-scoped lookup; never disclose another tenant's batch |
| POST /api/lead-vault/batches/:id/approve | Approve an immutable preview snapshot | Explicit human confirmation, role authorization, snapshot hash/version check, audit event |
| POST /api/lead-vault/batches/:id/commit | Transactionally create/link canonical contacts and provenance | Approved batch only, owner-scoped transaction, idempotent retry, no overwriting pre-existing contact data |
| POST /api/lead-vault/batches/:id/rollback | Reverse only effects created by that batch | Human approval, transaction, preserve pre-existing contacts, retain audit trail |
| GET /api/lead-vault/contacts | Search/list authorized contacts | Owner-scoped pagination, allowlisted filters, bounded page size |
| POST /api/lead-vault/contacts/:id/permissions | Record channel permission evidence | Human action, evidence and timestamp required for granted, audit event |
| POST /api/lead-vault/contacts/:id/suppressions | Add channel/global suppression | Immediate effect, append-only history, audit event |

The final route names may change during implementation, but these invariants must not.

## Batch lifecycle and transaction rules

1. Preview is a durable, reviewable batch, not an import.
2. Server recomputes normalized phone values and validation results. Never trust browser-supplied normalized values or row fingerprints.
3. Approval binds to an immutable batch snapshot hash. Any row, country-context, or source change invalidates approval.
4. Commit is allowed only for the approved snapshot. Use a database transaction and a unique (batch_id, source_row_key) idempotency boundary.
5. Resolve existing contacts only by valid E.164 identity within the same owner. Multiple matches or conflicting identities require manual review; never arbitrarily select one.
6. Preserve every source row and its provenance. Do not overwrite an existing name, email, source, permission, or note during deduplication.
7. Unknown permission is never consent. A current channel grant plus no active channel or global suppression is required before any channel action.
8. Rollback may archive or unlink only records/provenance created by the specified batch. It must never delete or rewrite a pre-existing canonical contact.
9. Audit every approval, commit, retry, skip, failure, permission change, suppression, export and rollback with actor, timestamp, request ID, batch and result counts. Avoid copying raw phone numbers or sensitive payloads into logs.

## Authentication and authorization decisions still required

- Bootstrap one verified DPF administrator account first; do not create a shared password or expose a public sign-up route by default.
- Before inviting staff, define explicit roles (for example owner/admin, operator, reviewer) and server-enforced permissions. Do not rely on hidden UI controls.
- Use short-lived Supabase Auth sessions and server-side user verification on every private API request.
- Any unauthenticated request receives 401; authenticated but unauthorized requests receive 403 or a non-disclosing 404.
- Apply per-user and per-IP rate limits. Enforce request-size limits before parsing.
- Keep secrets out of source control, browser bundles, logs, error responses and health endpoints.

## Observability, recovery and kill switches

- Emit structured request IDs and event counts for preview, approval, commit and rollback; redact phone/email values.
- Monitor API error rate, latency, auth failures, rate-limit events, database size, storage/bandwidth use and batch failure ratios.
- Add a server-side LEAD_VAULT_WRITES_ENABLED kill switch. When false, preview may be read-only or disabled by policy, and all commit/permission/suppression mutation routes must fail closed.
- Back up database content and schema separately. Because the Free Plan does not include automated backups, export encrypted backups to a separately controlled location, retain checksums and test restoration before loading customer records.
- No autonomous self-repair may change permissions, suppressions, contact identities, or customer records. Such changes require human approval.

## Implementation gates

1. Confirm initial administrator identity and whether staff access is needed at launch.
2. Implement Supabase Auth sign-in and a protected workspace shell.
3. Implement server-side auth helpers and role authorization before any write route.
4. Implement read-only batch/contact APIs and test tenant isolation.
5. Implement preview persistence, approval, transactional commit, rollback and audit.
6. Test with two users, anon, authenticated and service-role contexts against a disposable PostgreSQL 17/Supabase environment.
7. Verify backup/restore, kill switch, logs and usage monitoring.
8. Only then request approval to apply the migration to the dedicated DPF project and begin a small controlled test import.

## Current exclusions

No bulk messaging, scraping, WhatsApp automation, CRM sync, lead scoring from phone numbers, or agent-initiated outreach is part of this first database milestone. Consent status is tracked separately and defaults to unknown.


## Workspace role permission matrix

The membership migration and server permission helper establish this least-privilege baseline:

| Action | Owner | Admin | Operator | Reviewer |
|---|---:|---:|---:|---:|
| Read contacts and batches | Yes | Yes | Yes | Yes |
| Preview a batch | Yes | Yes | Yes | No |
| Approve a batch | Yes | Yes | No | Yes |
| Commit an approved batch | Yes | Yes | No | No |
| Roll back a batch | Yes | Yes | No | No |
| Manage channel permissions | Yes | Yes | No | No |
| Create a suppression | Yes | Yes | Yes | No |
| Manage workspace members | Yes | Yes | No | No |
| Export contacts | Yes | Yes | No | No |

Unknown roles and actions are denied. This is a server-side policy baseline, not a claim that every corresponding endpoint is already implemented. Every future route must call the permission guard before privileged work and must still perform owner-scoped queries and audit logging. Reviewers can approve but cannot commit; an authorized owner or admin performs the commit as a separate action. This separates review from execution.

Workspace membership is owner-scoped. The canonical owner_id on contact records remains the workspace owner's user ID; member user IDs must never be substituted for owner_id. Membership changes require a trusted, audited server operation and cannot be performed directly by authenticated browser clients.
