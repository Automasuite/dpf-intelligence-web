-- DPF Lead Vault: additive contact-import foundation.
-- REVIEW ONLY. Dedicated DPF Supabase project exists; this migration still requires schema/security review and explicit deployment approval.
-- No existing DPF lead tables are altered.
--
-- Design rules:
-- * Keep raw phone input and batch provenance.
-- * Only valid, explicitly normalized E.164 values become canonical phone identities.
-- * One canonical phone per owner; source rows remain independently traceable.
-- * Consent is channel-specific and defaults to unknown.
-- * Suppression overrides permission at application/service layer.
-- * Browser roles are read-only. Import, merge, approval and audit writes are server-side.
-- * Never infer names, investor intent, wealth, or channel availability from a phone number.

create table if not exists public.dpf_contact_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text,
  phone_validation_status text not null default 'needs_review'
    check (phone_validation_status in ('valid','invalid','incomplete','needs_review')),
  full_name text,
  email text,
  record_status text not null default 'active'
    check (record_status in ('active','archived','do_not_contact')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpf_contact_phone_e164_format
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint dpf_contact_valid_phone_required
    check (phone_validation_status <> 'valid' or phone_e164 is not null),
  constraint dpf_contact_id_owner_unique unique (id, owner_id)
);

create unique index if not exists dpf_contact_owner_phone_unique
  on public.dpf_contact_records(owner_id, phone_e164)
  where phone_e164 is not null;
create index if not exists dpf_contact_owner_status_idx
  on public.dpf_contact_records(owner_id, record_status, updated_at desc);

create table if not exists public.dpf_contact_import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_name text,
  source_label text not null,
  source_type text not null default 'user_supplied'
    check (source_type in ('user_supplied','manual_entry','approved_integration')),
  country_context text,
  status text not null default 'uploaded'
    check (status in ('uploaded','validating','preview_ready','awaiting_approval','approved','committing','committed','failed','cancelled','rolled_back')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpf_import_approval_pair
    check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null)),
  constraint dpf_import_batch_id_owner_unique unique (id, owner_id)
);

create index if not exists dpf_import_batches_owner_created_idx
  on public.dpf_contact_import_batches(owner_id, created_at desc);

create table if not exists public.dpf_contact_import_rows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.dpf_contact_import_batches(id) on delete cascade,
  source_row_key text not null,
  row_number integer not null check (row_number > 0),
  raw_phone text,
  normalized_phone_e164 text,
  phone_validation_status text not null default 'needs_review'
    check (phone_validation_status in ('valid','invalid','incomplete','needs_review')),
  validation_reason text,
  row_status text not null default 'pending'
    check (row_status in ('pending','valid','needs_review','invalid','duplicate_in_batch','duplicate_existing','approved','imported','skipped','failed')),
  canonical_contact_id uuid references public.dpf_contact_records(id) on delete set null,
  row_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint dpf_import_row_unique_key unique(batch_id, source_row_key),
  constraint dpf_import_row_unique_number unique(batch_id, row_number),
  constraint dpf_import_row_valid_phone_format
    check (normalized_phone_e164 is null or normalized_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint dpf_import_row_valid_status_requires_number
    check (phone_validation_status <> 'valid' or normalized_phone_e164 is not null),
  constraint dpf_import_row_id_owner_unique unique (id, owner_id)
);

-- Enforce tenant ownership across every parent/child relationship.
-- A valid UUID from another owner's row must never be linkable by mistake.
alter table public.dpf_contact_import_rows
  add constraint dpf_import_rows_batch_owner_fk
  foreign key (batch_id, owner_id)
  references public.dpf_contact_import_batches(id, owner_id)
  on delete cascade;

alter table public.dpf_contact_import_rows
  add constraint dpf_import_rows_contact_owner_fk
  foreign key (canonical_contact_id, owner_id)
  references public.dpf_contact_records(id, owner_id)
  on delete set null (canonical_contact_id);

create index if not exists dpf_import_rows_owner_batch_idx
  on public.dpf_contact_import_rows(owner_id, batch_id, row_number);
create index if not exists dpf_import_rows_owner_phone_idx
  on public.dpf_contact_import_rows(owner_id, normalized_phone_e164)
  where normalized_phone_e164 is not null;

create table if not exists public.dpf_contact_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.dpf_contact_records(id) on delete cascade,
  import_row_id uuid references public.dpf_contact_import_rows(id) on delete set null,
  source_type text not null,
  source_label text not null,
  source_reference text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.dpf_contact_sources
  add constraint dpf_contact_sources_contact_owner_fk
  foreign key (contact_id, owner_id)
  references public.dpf_contact_records(id, owner_id)
  on delete cascade;

alter table public.dpf_contact_sources
  add constraint dpf_contact_sources_row_owner_fk
  foreign key (import_row_id, owner_id)
  references public.dpf_contact_import_rows(id, owner_id)
  on delete set null (import_row_id);

-- NULL import_row_id values need their own idempotency rule because ordinary
-- UNIQUE constraints treat NULL values as distinct.
create unique index if not exists dpf_contact_sources_import_row_unique
  on public.dpf_contact_sources(import_row_id)
  where import_row_id is not null;
create unique index if not exists dpf_contact_sources_manual_unique
  on public.dpf_contact_sources(contact_id, source_label)
  where import_row_id is null;

create index if not exists dpf_contact_sources_owner_contact_idx
  on public.dpf_contact_sources(owner_id, contact_id, observed_at desc);

create table if not exists public.dpf_contact_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.dpf_contact_records(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','phone_call','sms','email')),
  permission_status text not null default 'unknown'
    check (permission_status in ('unknown','granted','withdrawn','not_applicable')),
  evidence_type text,
  evidence_reference text,
  captured_at timestamptz,
  expires_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpf_contact_permission_channel_unique unique(contact_id, channel),
  constraint dpf_permission_grant_requires_evidence
    check (permission_status <> 'granted' or (evidence_type is not null and captured_at is not null))
);

alter table public.dpf_contact_permissions
  add constraint dpf_contact_permissions_contact_owner_fk
  foreign key (contact_id, owner_id)
  references public.dpf_contact_records(id, owner_id)
  on delete cascade;

create table if not exists public.dpf_contact_suppressions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.dpf_contact_records(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','phone_call','sms','email','all')),
  reason text not null,
  source text not null default 'user_or_contact_request',
  effective_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dpf_suppression_lift_pair
    check ((lifted_at is null and lifted_by is null) or (lifted_at is not null and lifted_by is not null))
);

alter table public.dpf_contact_suppressions
  add constraint dpf_contact_suppressions_contact_owner_fk
  foreign key (contact_id, owner_id)
  references public.dpf_contact_records(id, owner_id)
  on delete cascade;

create index if not exists dpf_suppressions_active_idx
  on public.dpf_contact_suppressions(owner_id, contact_id, channel)
  where lifted_at is null;

create table if not exists public.dpf_lead_vault_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('human','system','agent')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  batch_id uuid references public.dpf_contact_import_batches(id) on delete set null,
  request_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.dpf_lead_vault_audit_events
  add constraint dpf_audit_batch_owner_fk
  foreign key (batch_id, owner_id)
  references public.dpf_contact_import_batches(id, owner_id)
  on delete set null (batch_id);

create index if not exists dpf_lead_vault_audit_owner_created_idx
  on public.dpf_lead_vault_audit_events(owner_id, created_at desc);
create unique index if not exists dpf_lead_vault_audit_request_action_unique
  on public.dpf_lead_vault_audit_events(owner_id, request_id, action)
  where request_id is not null;

-- Updated-at trigger helper is shared with the initial DPF lead schema if present.
create or replace function public.dpf_lead_vault_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dpf_contact_records_set_updated_at on public.dpf_contact_records;
create trigger dpf_contact_records_set_updated_at
before update on public.dpf_contact_records
for each row execute function public.dpf_lead_vault_set_updated_at();

drop trigger if exists dpf_contact_import_batches_set_updated_at on public.dpf_contact_import_batches;
create trigger dpf_contact_import_batches_set_updated_at
before update on public.dpf_contact_import_batches
for each row execute function public.dpf_lead_vault_set_updated_at();

drop trigger if exists dpf_contact_permissions_set_updated_at on public.dpf_contact_permissions;
create trigger dpf_contact_permissions_set_updated_at
before update on public.dpf_contact_permissions
for each row execute function public.dpf_lead_vault_set_updated_at();

-- Enable RLS everywhere. Only authenticated owners may read their own data.
-- Deliberately no authenticated INSERT/UPDATE/DELETE policies: trusted server
-- routes must validate the user, apply consent/suppression rules, and audit writes.
alter table public.dpf_contact_records enable row level security;
alter table public.dpf_contact_import_batches enable row level security;
alter table public.dpf_contact_import_rows enable row level security;
alter table public.dpf_contact_sources enable row level security;
alter table public.dpf_contact_permissions enable row level security;
alter table public.dpf_contact_suppressions enable row level security;
alter table public.dpf_lead_vault_audit_events enable row level security;

drop policy if exists dpf_contact_records_owner_read on public.dpf_contact_records;
create policy dpf_contact_records_owner_read on public.dpf_contact_records
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists dpf_import_batches_owner_read on public.dpf_contact_import_batches;
create policy dpf_import_batches_owner_read on public.dpf_contact_import_batches
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists dpf_import_rows_owner_read on public.dpf_contact_import_rows;
create policy dpf_import_rows_owner_read on public.dpf_contact_import_rows
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists dpf_contact_sources_owner_read on public.dpf_contact_sources;
create policy dpf_contact_sources_owner_read on public.dpf_contact_sources
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists dpf_contact_permissions_owner_read on public.dpf_contact_permissions;
create policy dpf_contact_permissions_owner_read on public.dpf_contact_permissions
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists dpf_contact_suppressions_owner_read on public.dpf_contact_suppressions;
create policy dpf_contact_suppressions_owner_read on public.dpf_contact_suppressions
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists dpf_lead_vault_audit_owner_read on public.dpf_lead_vault_audit_events;
create policy dpf_lead_vault_audit_owner_read on public.dpf_lead_vault_audit_events
for select to authenticated using ((select auth.uid()) = owner_id);


-- Explicit table privileges complement RLS; do not rely on project defaults.
revoke all on table
  public.dpf_contact_records,
  public.dpf_contact_import_batches,
  public.dpf_contact_import_rows,
  public.dpf_contact_sources,
  public.dpf_contact_permissions,
  public.dpf_contact_suppressions,
  public.dpf_lead_vault_audit_events
from public, anon, authenticated;

grant select on table
  public.dpf_contact_records,
  public.dpf_contact_import_batches,
  public.dpf_contact_import_rows,
  public.dpf_contact_sources,
  public.dpf_contact_permissions,
  public.dpf_contact_suppressions,
  public.dpf_lead_vault_audit_events
to authenticated;

grant all on table
  public.dpf_contact_records,
  public.dpf_contact_import_batches,
  public.dpf_contact_import_rows,
  public.dpf_contact_sources,
  public.dpf_contact_permissions,
  public.dpf_contact_suppressions,
  public.dpf_lead_vault_audit_events
to service_role;

-- Application invariants that must be enforced in trusted server code:
-- 1. A contact is eligible for a channel only when permission is currently granted
--    and no active channel-specific or 'all' suppression exists.
-- 2. An unknown permission is never treated as consent.
-- 3. Import commit is allowed only for an approved batch and is idempotent by
--    (batch_id, source_row_key); retries must not create duplicate provenance.
-- 4. Do not match unresolved numbers. Never infer a country without explicit batch
--    context. A canonical phone collision is a duplicate to review/link, not a
--    reason to discard the source row.
-- 5. The service role bypasses RLS; every server route must authenticate the user,
--    scope owner_id from auth context, validate input, enforce limits, and audit.
