-- DPF lead intelligence hardening and foreign-key indexes.
-- Additive, non-destructive follow-up migration.

-- Cover foreign-key lookups and parent-row updates/deletes.
create index if not exists dpf_lead_events_lead_id_idx
  on public.dpf_lead_events(lead_id);
create index if not exists dpf_lead_events_approved_by_idx
  on public.dpf_lead_events(approved_by);
create index if not exists dpf_followups_lead_id_idx
  on public.dpf_follow_up_tasks(lead_id);
create index if not exists dpf_followups_approved_by_idx
  on public.dpf_follow_up_tasks(approved_by);
create index if not exists dpf_agent_runs_approved_by_idx
  on public.dpf_agent_runs(approved_by);

-- Client-created audit entries must represent human actions only.
-- Agent/system events and approval attestations are written server-side.
drop policy if exists "dpf_lead_events_owner_insert" on public.dpf_lead_events;
create policy "dpf_lead_events_owner_insert"
  on public.dpf_lead_events
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and actor_type = 'human'
    and requires_approval = false
    and approved_by is null
    and approved_at is null
    and exists (
      select 1 from public.dpf_leads l
      where l.id = lead_id and l.owner_id = (select auth.uid())
    )
  );

-- Agent run lifecycle is server-controlled; authenticated clients may only read.
drop policy if exists "dpf_agent_runs_owner_insert" on public.dpf_agent_runs;
drop policy if exists "dpf_agent_runs_owner_update" on public.dpf_agent_runs;
revoke insert, update, delete on table public.dpf_agent_runs from authenticated;
grant select on table public.dpf_agent_runs to authenticated;
