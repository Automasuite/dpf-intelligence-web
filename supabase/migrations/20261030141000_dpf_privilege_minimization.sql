-- Minimize authenticated grants after the 2026-10-30 Data API change.
-- Remove inherited/default table privileges, then grant only the operations
-- required by the DPF browser workspace. RLS remains enabled on every table.

revoke all privileges on table public.dpf_leads from authenticated;
revoke all privileges on table public.dpf_lead_events from authenticated;
revoke all privileges on table public.dpf_follow_up_tasks from authenticated;
revoke all privileges on table public.dpf_agent_runs from authenticated;

grant select, insert, update, delete on table public.dpf_leads to authenticated;
grant select, insert on table public.dpf_lead_events to authenticated;
grant select, insert, update, delete on table public.dpf_follow_up_tasks to authenticated;
grant select on table public.dpf_agent_runs to authenticated;
