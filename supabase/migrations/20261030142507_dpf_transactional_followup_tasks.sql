-- DPF transactional follow-up task lifecycle.
-- Task changes and the associated lead timeline event commit or roll back together.

create or replace function public.dpf_create_follow_up_task_with_event(
  p_owner_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.dpf_follow_up_tasks%rowtype;
  v_lead_id uuid;
  v_allowed text[] := array['lead_id','title','description','due_at','priority','channel'];
  v_key text;
begin
  if p_owner_id is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_followup_payload' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'invalid_followup_field' using errcode = '22023';
    end if;
  end loop;
  if nullif(btrim(p_payload->>'title'),'') is null
     or nullif(p_payload->>'lead_id','') is null
     or nullif(p_payload->>'due_at','') is null then
    raise exception 'required_followup_fields_missing' using errcode = '22023';
  end if;

  v_lead_id := (p_payload->>'lead_id')::uuid;
  perform 1 from public.dpf_leads
   where id = v_lead_id and owner_id = p_owner_id
   for key share;
  if not found then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  insert into public.dpf_follow_up_tasks (
    owner_id, lead_id, title, description, due_at, priority, channel,
    suggested_by, approval_status
  ) values (
    p_owner_id, v_lead_id, btrim(p_payload->>'title'),
    nullif(p_payload->>'description',''),
    (p_payload->>'due_at')::timestamptz,
    coalesce(nullif(p_payload->>'priority',''),'normal'),
    nullif(p_payload->>'channel',''),
    'human', 'not_required'
  ) returning * into v_task;

  insert into public.dpf_lead_events (
    owner_id, lead_id, event_type, actor_type, summary, new_value, requires_approval
  ) values (
    p_owner_id, v_lead_id, 'followup_scheduled', 'human',
    'Follow-up task scheduled: ' || v_task.title,
    jsonb_build_object(
      'task_id',v_task.id,'title',v_task.title,'due_at',v_task.due_at,
      'status',v_task.status,'priority',v_task.priority,'channel',v_task.channel
    ),
    false
  );
  return to_jsonb(v_task);
end;
$$;

create or replace function public.dpf_update_follow_up_task_with_event(
  p_owner_id uuid,
  p_task_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.dpf_follow_up_tasks%rowtype;
  v_after public.dpf_follow_up_tasks%rowtype;
  v_allowed text[] := array['title','description','due_at','status','priority','channel'];
  v_key text;
  v_summary text;
begin
  if p_owner_id is null or p_task_id is null
     or jsonb_typeof(p_payload) <> 'object' or p_payload = '{}'::jsonb then
    raise exception 'invalid_followup_update' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'invalid_followup_field' using errcode = '22023';
    end if;
  end loop;
  if p_payload ? 'title' and nullif(btrim(p_payload->>'title'),'') is null then
    raise exception 'invalid_followup_title' using errcode = '22023';
  end if;

  select * into v_before
  from public.dpf_follow_up_tasks
  where id = p_task_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'followup_not_found' using errcode = 'P0002';
  end if;

  update public.dpf_follow_up_tasks set
    title = case when p_payload ? 'title' then btrim(p_payload->>'title') else title end,
    description = case when p_payload ? 'description' then nullif(p_payload->>'description','') else description end,
    due_at = case when p_payload ? 'due_at' then (p_payload->>'due_at')::timestamptz else due_at end,
    status = case when p_payload ? 'status' then p_payload->>'status' else status end,
    priority = case when p_payload ? 'priority' then p_payload->>'priority' else priority end,
    channel = case when p_payload ? 'channel' then nullif(p_payload->>'channel','') else channel end,
    completed_at = case
      when p_payload ? 'status' and p_payload->>'status' = 'completed'
        then coalesce(completed_at, now())
      when p_payload ? 'status' then null
      else completed_at
    end
  where id = p_task_id and owner_id = p_owner_id
  returning * into v_after;

  v_summary := case
    when v_before.status is distinct from v_after.status and v_after.status = 'completed'
      then 'Follow-up task completed: ' || v_after.title
    when v_before.status is distinct from v_after.status and v_after.status = 'cancelled'
      then 'Follow-up task cancelled: ' || v_after.title
    else 'Follow-up task updated: ' || v_after.title
  end;

  insert into public.dpf_lead_events (
    owner_id, lead_id, event_type, actor_type, summary, previous_value, new_value, requires_approval
  ) values (
    p_owner_id, v_after.lead_id, 'followup_scheduled', 'human', v_summary,
    jsonb_build_object(
      'task_id',v_before.id,'title',v_before.title,'due_at',v_before.due_at,
      'status',v_before.status,'priority',v_before.priority,'channel',v_before.channel
    ),
    jsonb_build_object(
      'task_id',v_after.id,'title',v_after.title,'due_at',v_after.due_at,
      'status',v_after.status,'priority',v_after.priority,'channel',v_after.channel,
      'completed_at',v_after.completed_at
    ),
    false
  );
  return to_jsonb(v_after);
end;
$$;

revoke all on function public.dpf_create_follow_up_task_with_event(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.dpf_update_follow_up_task_with_event(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.dpf_create_follow_up_task_with_event(uuid,jsonb) to service_role;
grant execute on function public.dpf_update_follow_up_task_with_event(uuid,uuid,jsonb) to service_role;
