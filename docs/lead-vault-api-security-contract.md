# DPF Lead Vault — server API and security contract

## Current implementation status

The isolated feature branch contains a protected workspace sign-in gate, server-side Supabase session verification, active workspace membership checks, role-based server permission guards, a durable CSV preview API, batch approval and transactional commit APIs, and four additive Lead Vault SQL migrations.

The browser workspace still uses its local preview and session-only lead capture. It has not yet been wired to the durable preview API. The write kill switch is off by default. No Lead Vault migration has been applied to the dedicated DPF Supabase project, no administrator membership has been provisioned, and no customer records have been imported.

## Trust boundaries

- Browser code is untrusted. It may parse a CSV for immediate preview and display authorized API responses, but it must not decide owner identity, approve imports, merge contacts, set permission, bypass suppression, or write directly to Lead Vault tables.
- Every private API verifies the Supabase access token and derives the actor ID from the verified user. Ignore actor/owner IDs supplied by the browser unless they are checked against the caller's active workspace memberships.
- The server may use the Supabase service-role key only for narrowly scoped database operations after authentication and role checks. It exists only in server-side environment variables; never use a VITE_ prefix.
- Contact records use the workspace owner's user ID as owner_id. Staff user IDs must never be substituted for that canonical workspace owner ID.
- No agent or automation may message contacts, export records, change permission, or lift a suppression without a separately authorized and auditable human action.

## Implemented API routes

All routes return Cache-Control: no-store, require HTTPS and use a verified Supabase access token for private access.

| Method and route | Status | Purpose and controls |
|---|---|---|
| GET /api/lead-vault/session | Implemented | Verifies Supabase token and requires at least one active workspace membership before the workspace renders |
| POST /api/lead-vault/batches/preview | Implemented, not yet wired to UI | Server parses phone-only CSV, enforces 4 MB / 10,000 row / 50 column caps, applies explicit country context, normalizes phone values, computes SHA-256 row fingerprints, and atomically persists a preview batch and all source rows |
| POST /api/lead-vault/batches/:id/approve | Implemented, gated | Requires batches.approve permission and an idempotency key; calls the database approval RPC |
| POST /api/lead-vault/batches/:id/commit | Implemented, gated | Requires batches.commit permission and an idempotency key; calls the transactional database commit RPC |

All three mutation routes require LEAD_VAULT_WRITES_ENABLED=true. If unset or false, they fail closed. They also require SUPABASE_SERVICE_ROLE_KEY on the server; this key is not configured in the application by this work.

## Workspace roles

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

Unknown roles and actions are denied. The server helper and permission matrix are implemented. Corresponding APIs for rollback, permission management, member management, contact reads and exports are not yet implemented. A role label alone does not enable an action.

## Batch lifecycle and transaction rules

1. Preview is a durable, reviewable batch, not an import. The preview RPC inserts the batch and all source rows atomically.
2. The server recomputes normalization and validation; browser-supplied normalized values are never trusted.
3. Every row is retained with its raw phone, source row key, source reference, validation status and server-generated fingerprint.
4. A batch cannot be approved while any row is unresolved. Invalid or ambiguous rows must be explicitly skipped through a future reviewer workflow.
5. Approval stores a snapshot checksum. The current SQL uses MD5 as a change-detection checksum, not as a cryptographic signature. Approved rows are protected by a database trigger against further changes except during the trusted commit function.
6. Commit is allowed only for an approved snapshot. The database function runs transactionally and is retry-safe.
7. Resolve existing contacts only by valid E.164 identity within the same owner. Existing names and contact fields are not overwritten.
8. Every source row gets provenance, including duplicate rows that link to an existing canonical contact.
9. Unknown permission is never consent. A current channel grant plus no active channel-specific or global suppression is required before any channel action.
10. Audit approval, commit, retries, skips, failures, permission changes, suppression, export and rollback. Do not place raw phone numbers or sensitive payloads in operational logs.

## Authentication and environment configuration

- Supabase email/password sign-in is implemented; there is no public registration in the application.
- The workspace requires an active membership. The first owner account and owner membership have not been provisioned.
- The membership migration provides owner, admin, operator and reviewer roles. Authenticated clients cannot directly create or change memberships.
- Client environment: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
- Server environment: SUPABASE_URL and SUPABASE_ANON_KEY for token verification; SUPABASE_SERVICE_ROLE_KEY for trusted database RPC calls.
- LEAD_VAULT_WRITES_ENABLED must remain unset or false until all activation blockers are cleared and explicit operational approval is given.
- Never put a service-role key, database password or other privileged credential in a VITE_ variable, client bundle, response or log.

## Observability, reliability and kill switches

- Structured request IDs and result counts are required for preview, approval, commit and rollback. Redact phone and email values from logs.
- Monitor API error rate, latency, auth failures, rate-limit events, database size, storage/bandwidth usage and batch failure ratios.
- A global server-side write kill switch is implemented for preview, approval and commit routes. It defaults to off.
- API rate limiting is not yet implemented. The write kill switch must remain off until per-user and per-IP rate limits are added.
- Backups and tested restore procedures are not yet configured. Verify encrypted backups, checksums and restoration before importing customer data.
- No autonomous self-repair may change permissions, suppressions, contact identities or customer records. Such changes require human approval.

## Remaining activation blockers

1. Add per-user and per-IP API rate limiting.
2. Add reviewer skip/review endpoints for unresolved rows.
3. Wire the browser CSV preview interface to the durable preview API and display persisted batch state.
4. Implement rollback, contact read/search, member management, permission and suppression APIs.
5. Complete end-to-end authentication and two-user tenant-isolation tests against the actual DPF Supabase project.
6. Provision the first owner account and membership after the administrator email is confirmed.
7. Configure server environment variables in the approved Vercel project, without exposing privileged keys.
8. Verify backups, restore, audit retention and monitoring.
9. Obtain explicit approval before applying any of the four Lead Vault migrations or enabling the write kill switch.

## Separate legacy-schema migration dependency

The branch also contains a separate migration named 20261030140000_dpf_hardening_and_fk_indexes.sql. It references legacy tables created by 202610290001_lead_intelligence.sql. That legacy migration is not included in the four-migration Lead Vault PostgreSQL smoke-test sequence described above. Review and test the legacy migration chain separately before applying the complete Supabase migration directory.

## Current exclusions

No bulk messaging, scraping, WhatsApp automation, CRM sync, lead scoring from phone numbers, or agent-initiated outreach is part of this first database milestone. Consent remains channel-specific and defaults to unknown.
