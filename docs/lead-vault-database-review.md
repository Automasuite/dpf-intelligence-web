# DPF Lead Vault — database foundation review

## Status

The additive migration `supabase/migrations/202610300001_dpf_lead_vault.sql` is committed to `feature/dpf-lead-vault-v1` for review only. It has **not** been applied to any database.

The dedicated Supabase project `DPF Investor Intelligence` has now been created in the Automasuite organization in `eu-central-1` and verified `ACTIVE_HEALTHY`. Its project reference is `ksjyqrzdcfikgnroceju`. The live project currently reports no application migrations. The migration remains review-only and has not been applied.

## Data model

- `dpf_contact_records`: one canonical contact per owner and normalized E.164 phone; unresolved numbers remain without a canonical phone identity.
- `dpf_contact_import_batches`: source, explicit country context, workflow status and validation counters.
- `dpf_contact_import_rows`: raw phone, normalized result, row fingerprint, validation reason and idempotent batch row key. Composite owner-scoped foreign keys prevent cross-owner parent/child links.
- `dpf_contact_sources`: provenance links from a canonical contact back to each source row, with separate unique indexes for imported rows and manual-source records so NULL values cannot bypass idempotency.
- `dpf_contact_permissions`: one permission record per contact and channel; defaults to unknown.
- `dpf_contact_suppressions`: channel-specific or global suppression. Active suppression overrides permission.
- `dpf_lead_vault_audit_events`: append-oriented audit history with actor, action, entity and request ID.

## Import lifecycle

1. Upload a supported CSV and record its batch/source metadata.
2. Parse rows with strict size, encoding and column limits.
3. Preserve each raw phone string; normalize only with explicit country context or an international plus prefix.
4. Classify rows as valid, invalid, incomplete or needs-review.
5. Detect duplicates within the batch and against existing canonical contacts. Keep every source row and provenance record.
6. Show a preview with counts and row-level explanations.
7. Require a human approval before commit.
8. Commit through a trusted server route, using batch-row idempotency keys and database uniqueness constraints.
9. Record audit events and reconcile imported/skipped/failed counts.
10. Support a controlled rollback that archives or reverses only records created by that batch; never delete pre-existing canonical contacts as a side effect.

## Security decisions

- RLS is enabled on every new table.
- Authenticated browser access is read-only and owner-scoped.
- No browser-role write policies are defined. Import, approval, merge, suppression changes and audit writes must pass through authenticated server-side routes.
- Server routes must derive `owner_id` from the authenticated identity, never trust a client-supplied owner ID, validate all input, rate-limit imports and audit writes.
- Service-role credentials must remain server-side.
- A channel is eligible for contact only if permission is explicitly granted, current, and no active matching or global suppression exists.
- Unknown permission is not consent. No bulk messaging or anti-spam circumvention is part of this system.

## Review gates before applying

- Dedicated DPF Supabase project is identified and created; confirm its ownership and project reference before deployment.
- Confirm the intended DPF administrator and user-authentication model.
- Apply the migration to a disposable PostgreSQL/Supabase test environment first.
- Test RLS with two users, anon, authenticated and service-role access.
- Test duplicate races, repeated commit requests, invalid rows, consent/suppression precedence and rollback.
- Verify backups and restoration before any production data import.

## Workspace import preview

The DPF workspace now includes a client-side CSV preview at `#lead-vault-import`.

- Accepts CSV only, with a 5 MB client-side limit and parser limits of 10,000 rows and 50 columns.
- Requires a recognized phone column; optional supplied name and source/reference values are preserved for preview.
- Email columns are intentionally ignored in this first phone-only phase.
- Country context is explicit; Nigeria is never assumed unless selected by the operator.
- Shows normalized phone, validation result, in-file duplicates, and row-level reason.
- The "Mark preview reviewed" action only acknowledges the preview in browser memory. It does not approve a database import or write records.
- Existing-database duplicate checks, durable batch records, canonical contact creation, and import commit remain unavailable until the dedicated database and trusted server routes exist.


## Latest schema-hardening review

- Added composite `(id, owner_id)` parent keys and owner-scoped foreign keys for batches, rows, contacts, permissions, suppressions, sources and audit batch references.
- Added deterministic source-row uniqueness for imported provenance and a separate uniqueness rule for manual provenance; this closes the NULL-related duplicate gap in the original unique constraint.
- The SQL uses PostgreSQL 15+ column-list `ON DELETE SET NULL` syntax; the verified project runs PostgreSQL 17.
- This is static review only. The migration has not been executed against the live database or a disposable test database. Before deployment, run it against a disposable PostgreSQL 17 environment and verify SQL syntax, RLS behavior, role grants, tenant-isolation tests, duplicate/retry behavior and rollback.
