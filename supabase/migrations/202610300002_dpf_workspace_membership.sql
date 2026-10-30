-- DPF workspace membership and role-based read access.
-- Review-only additive migration. Do not apply to the live project without approval.
-- One workspace owner may invite distinct users with least-privilege roles.
-- Existing contact owner_id remains the workspace owner ID, not the acting member ID.

create table if not exists public.dpf_workspace_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','operator','reviewer')),
  membership_status text not null default 'active'
    check (membership_status in ('active','suspended','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpf_workspace_member_unique unique(owner_id,user_id),
  constraint dpf_workspace_member_id_owner_unique unique(id,owner_id),
  constraint dpf_workspace_owner_role_consistent
    check ((role = 'owner' and user_id = owner_id) or (role <> 'owner' and user_id <> owner_id))
);

create index if not exists dpf_workspace_members_user_active_idx
  on public.dpf_workspace_members(user_id, membership_status, owner_id);

create index if not exists dpf_workspace_members_owner_active_idx
  on public.dpf_workspace_members(owner_id, membership_status, role);

create or replace function public.dpf_workspace_member_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dpf_workspace_members_set_updated_at on public.dpf_workspace_members;
create trigger dpf_workspace_members_set_updated_at
before update on public.dpf_workspace_members
for each row execute function public.dpf_workspace_member_set_updated_at();

alter table public.dpf_workspace_members enable row level security;

revoke all on table public.dpf_workspace_members from public, anon, authenticated;
grant select on table public.dpf_workspace_members to authenticated;
grant all on table public.dpf_workspace_members to service_role;

drop policy if exists dpf_workspace_members_self_read on public.dpf_workspace_members;
create policy dpf_workspace_members_self_read on public.dpf_workspace_members
for select to authenticated
using ((select auth.uid()) = user_id or (select auth.uid()) = owner_id);

-- Replace owner-only contact policies with active workspace membership checks.
drop policy if exists dpf_contact_records_owner_read on public.dpf_contact_records;
create policy dpf_contact_records_member_read on public.dpf_contact_records
for select to authenticated
using (exists (
  select 1 from public.dpf_workspace_members m
  where m.owner_id = dpf_contact_records.owner_id
    and m.user_id = (select auth.uid())
    and m.membership_status = 'active'
));

drop policy if exists dpf_import_batches_owner_read on public.dpf_contact_import_batches;
create policy dpf_import_batches_member_read on public.dpf_contact_import_batches
for select to authenticated
using (exists (
  select 1 from public.dpf_workspace_members m
  where m.owner_id = dpf_contact_import_batches.owner_id
    and m.user_id = (select auth.uid())
    and m.membership_status = 'active'
));

drop policy if exists dpf_import_rows_owner_read on public.dpf_contact_import_rows;
create policy dpf_import_rows_member_read on public.dpf_contact_import_rows
for select to authenticated
using (exists (
  select 1 from public.dpf_workspace_members m
  where m.owner_id = dpf_contact_import_rows.owner_id
    and m.user_id = (select auth.uid())
    and m.membership_status = 'active'
));

drop policy if exists dpf_contact_sources_owner_read on public.dpf_contact_sources;
create policy dpf_contact_sources_member_read on public.dpf_contact_sources
for select to authenticated
using (exists (
  select 1 from public.dpf_workspace_members m
  where m.owner_id = dpf_contact_sources.owner_id
    and m.user_id = (select auth.uid())
    and m.membership_status = 'active'
));

drop policy if exists dpf_contact_permissions_owner_read on public.dpf_contact_permissions;
create policy dpf_contact_permissions_member_read on public.dpf_contact_permissions
for select to authenticated
using (exists (
  select 1 from public.dpf_workspace_members m
  where m.owner_id = dpf_contact_permissions.owner_id
    and m.user_id = (select auth.uid())
    and m.membership_status = 'active'
));

drop policy if exists dpf_contact_suppressions_owner_read on public.dpf_contact_suppressions;
create policy dpf_contact_suppressions_member_read on public.dpf_contact_suppressions
for select to authenticated
using (exists (
  select 1 from public.dpf_workspace_members m
  where m.owner_id = dpf_contact_suppressions.owner_id
    and m.user_id = (select auth.uid())
    and m.membership_status = 'active'
));

drop policy if exists dpf_lead_vault_audit_owner_read on public.dpf_lead_vault_audit_events;
create policy dpf_lead_vault_audit_member_read on public.dpf_lead_vault_audit_events
for select to authenticated
using (exists (
  select 1 from public.dpf_workspace_members m
  where m.owner_id = dpf_lead_vault_audit_events.owner_id
    and m.user_id = (select auth.uid())
    and m.membership_status = 'active'
));

comment on table public.dpf_workspace_members is
  'Workspace membership. All membership mutations must be performed by trusted server code after role checks and audit logging.';
comment on column public.dpf_workspace_members.owner_id is
  'Canonical workspace owner and owner_id scope for Lead Vault records.';
comment on column public.dpf_workspace_members.role is
  'Least-privilege workspace role; server APIs must enforce action-specific permissions.';
