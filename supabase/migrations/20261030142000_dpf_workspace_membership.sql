-- DPF single-administrator workspace membership foundation.
-- The owner is the first and only member initially. Additional roles can be
-- provisioned later without changing the lead ownership model.

create table if not exists public.dpf_workspace_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner','admin','operator','reviewer')),
  membership_status text not null default 'active'
    check (membership_status in ('active','suspended','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpf_workspace_members_owner_identity_check
    check (role <> 'owner' or owner_id = user_id),
  constraint dpf_workspace_members_owner_user_unique
    unique (owner_id, user_id)
);

create unique index if not exists dpf_workspace_single_owner_uidx
  on public.dpf_workspace_members(owner_id)
  where role = 'owner';
create index if not exists dpf_workspace_members_user_status_idx
  on public.dpf_workspace_members(user_id, membership_status);

create or replace function public.dpf_workspace_members_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dpf_workspace_members_set_updated_at
  on public.dpf_workspace_members;
create trigger dpf_workspace_members_set_updated_at
  before update on public.dpf_workspace_members
  for each row execute function public.dpf_workspace_members_set_updated_at();

alter table public.dpf_workspace_members enable row level security;

drop policy if exists "dpf_workspace_members_self_select"
  on public.dpf_workspace_members;
create policy "dpf_workspace_members_self_select"
  on public.dpf_workspace_members
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated, service_role;
revoke all privileges on table public.dpf_workspace_members from anon;
revoke all privileges on table public.dpf_workspace_members from authenticated;
grant select on table public.dpf_workspace_members to authenticated;
grant select, insert, update, delete on table public.dpf_workspace_members to service_role;
