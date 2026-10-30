-- DPF Lead Intelligence: initial additive schema.
-- Private by default. No public/anon access to buyer contact information.
-- Apply only to the dedicated DPF Supabase project after confirming project ownership and authentication setup.

create extension if not exists pgcrypto;

create table if not exists public.dpf_leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  source text not null default 'manual_entry',
  stage text not null default 'signal'
    check (stage in ('signal','intent','qualified','matched','conversation','inspection','transaction','closed_won','closed_lost','nurture')),
  budget_amount numeric(18,2) check (budget_amount is null or budget_amount >= 0),
  currency_code text not null default 'NGN' check (char_length(currency_code) = 3),
  preferred_location text,
  property_type text,
  buying_timeline text,
  purpose text,
  payment_preference text,
  motivation text,
  risk_or_objection text,
  next_action_at timestamptz,
  next_action_summary text,
  consent_status text not null default 'unknown'
    check (consent_status in ('unknown','given','withdrawn','not_required')),
  record_status text not null default 'active'
    check (record_status in ('active','archived','do_not_contact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_contacted_at timestamptz,
  qualified_at timestamptz,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists dpf_leads_owner_stage_idx on public.dpf_leads(owner_id, stage, updated_at desc);
create index if not exists dpf_leads_owner_followup_idx on public.dpf_leads(owner_id, next_action_at) where next_action_at is not null;
create index if not exists dpf_leads_owner_created_idx on public.dpf_leads(owner_id, created_at desc);

create table if not exists public.dpf_lead_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.dpf_leads(id) on delete cascade,
  event_type text not null check (event_type in ('created','stage_changed','note_added','contact_attempted','followup_scheduled','consent_changed','qualification_updated','match_created','inspection_scheduled','transaction_updated','record_archived','system_notice')),
  actor_type text not null default 'human' check (actor_type in ('human','agent','system')),
  summary text not null,
  previous_value jsonb,
  new_value jsonb,
  requires_approval boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dpf_lead_events_approval_pair check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null))
);

create index if not exists dpf_lead_events_owner_lead_idx on public.dpf_lead_events(owner_id, lead_id, created_at desc);

create table if not exists public.dpf_follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.dpf_leads(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled','snoozed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  channel text check (channel is null or channel in ('whatsapp','phone','email','in_person','other')),
  suggested_by text not null default 'human' check (suggested_by in ('human','agent','system')),
  approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpf_followup_approval_pair check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null))
);

create index if not exists dpf_followups_owner_due_idx on public.dpf_follow_up_tasks(owner_id, due_at) where status in ('pending','in_progress','snoozed');

create table if not exists public.dpf_agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null,
  workflow_name text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled','needs_approval')),
  input_summary text,
  result_summary text,
  source_urls jsonb not null default '[]'::jsonb,
  items_found integer not null default 0 check (items_found >= 0),
  items_accepted integer not null default 0 check (items_accepted >= 0),
  error_code text,
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  approval_required boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  constraint dpf_agent_runs_approval_pair check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null))
);

create index if not exists dpf_agent_runs_owner_created_idx on public.dpf_agent_runs(owner_id, created_at desc);

create or replace function public.dpf_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dpf_leads_set_updated_at on public.dpf_leads;
create trigger dpf_leads_set_updated_at before update on public.dpf_leads
for each row execute function public.dpf_set_updated_at();

drop trigger if exists dpf_followups_set_updated_at on public.dpf_follow_up_tasks;
create trigger dpf_followups_set_updated_at before update on public.dpf_follow_up_tasks
for each row execute function public.dpf_set_updated_at();

alter table public.dpf_leads enable row level security;
alter table public.dpf_lead_events enable row level security;
alter table public.dpf_follow_up_tasks enable row level security;
alter table public.dpf_agent_runs enable row level security;

-- Authenticated users can only access records they own.
drop policy if exists "dpf_leads_owner_select" on public.dpf_leads;
create policy "dpf_leads_owner_select" on public.dpf_leads for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "dpf_leads_owner_insert" on public.dpf_leads;
create policy "dpf_leads_owner_insert" on public.dpf_leads for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "dpf_leads_owner_update" on public.dpf_leads;
create policy "dpf_leads_owner_update" on public.dpf_leads for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "dpf_leads_owner_delete" on public.dpf_leads;
create policy "dpf_leads_owner_delete" on public.dpf_leads for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "dpf_lead_events_owner_select" on public.dpf_lead_events;
create policy "dpf_lead_events_owner_select" on public.dpf_lead_events for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "dpf_lead_events_owner_insert" on public.dpf_lead_events;
create policy "dpf_lead_events_owner_insert" on public.dpf_lead_events for insert to authenticated with check ((select auth.uid()) = owner_id and exists (select 1 from public.dpf_leads l where l.id = lead_id and l.owner_id = (select auth.uid())));

drop policy if exists "dpf_followups_owner_select" on public.dpf_follow_up_tasks;
create policy "dpf_followups_owner_select" on public.dpf_follow_up_tasks for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "dpf_followups_owner_insert" on public.dpf_follow_up_tasks;
create policy "dpf_followups_owner_insert" on public.dpf_follow_up_tasks for insert to authenticated with check ((select auth.uid()) = owner_id and exists (select 1 from public.dpf_leads l where l.id = lead_id and l.owner_id = (select auth.uid())));
drop policy if exists "dpf_followups_owner_update" on public.dpf_follow_up_tasks;
create policy "dpf_followups_owner_update" on public.dpf_follow_up_tasks for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and exists (select 1 from public.dpf_leads l where l.id = lead_id and l.owner_id = (select auth.uid())));
drop policy if exists "dpf_followups_owner_delete" on public.dpf_follow_up_tasks;
create policy "dpf_followups_owner_delete" on public.dpf_follow_up_tasks for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "dpf_agent_runs_owner_select" on public.dpf_agent_runs;
create policy "dpf_agent_runs_owner_select" on public.dpf_agent_runs for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "dpf_agent_runs_owner_insert" on public.dpf_agent_runs;
create policy "dpf_agent_runs_owner_insert" on public.dpf_agent_runs for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "dpf_agent_runs_owner_update" on public.dpf_agent_runs;
create policy "dpf_agent_runs_owner_update" on public.dpf_agent_runs for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- No policies are granted to anon/public. Do not store secrets or unrestricted crawler payloads here.

-- Explicit Data API privileges (Supabase 2026-10-30 default change).
-- No anonymous access. RLS policies above remain the row-level authorization boundary.
grant usage on schema public to authenticated, service_role;

revoke all on table public.dpf_leads from anon;
revoke all on table public.dpf_lead_events from anon;
revoke all on table public.dpf_follow_up_tasks from anon;
revoke all on table public.dpf_agent_runs from anon;

grant select, insert, update, delete on table public.dpf_leads to authenticated;
grant select, insert on table public.dpf_lead_events to authenticated;
grant select, insert, update, delete on table public.dpf_follow_up_tasks to authenticated;
grant select, insert, update on table public.dpf_agent_runs to authenticated;

-- Backend service role privileges are server-side only; never expose its key in the browser.
grant select, insert, update, delete on table public.dpf_leads to service_role;
grant select, insert, update, delete on table public.dpf_lead_events to service_role;
grant select, insert, update, delete on table public.dpf_follow_up_tasks to service_role;
grant select, insert, update, delete on table public.dpf_agent_runs to service_role;
