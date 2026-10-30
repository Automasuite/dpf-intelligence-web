-- Transactional follow-up task and lead-timeline assertions on disposable PostgreSQL.
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000011'),
 ('00000000-0000-4000-8000-000000000012');

do $test$
declare
  v_owner uuid := '00000000-0000-4000-8000-000000000011';
  v_other_owner uuid := '00000000-0000-4000-8000-000000000012';
  v_lead jsonb;
  v_task jsonb;
  v_updated jsonb;
  v_lead_id uuid;
  v_task_id uuid;
  v_events integer;
  v_status text;
begin
  if has_function_privilege('anon','public.dpf_create_follow_up_task_with_event(uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.dpf_create_follow_up_task_with_event(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.dpf_create_follow_up_task_with_event(uuid,jsonb)','EXECUTE') then
    raise exception 'followup_create_function_grants_invalid';
  end if;
  if has_function_privilege('anon','public.dpf_update_follow_up_task_with_event(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.dpf_update_follow_up_task_with_event(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.dpf_update_follow_up_task_with_event(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'followup_update_function_grants_invalid';
  end if;

  v_lead := public.dpf_create_lead_with_event(v_owner,jsonb_build_object(
    'full_name','Follow-up Test Lead','phone','+2340000000011','source','ci_test'
  ));
  v_lead_id := (v_lead->>'id')::uuid;

  begin
    perform public.dpf_create_follow_up_task_with_event(v_other_owner,jsonb_build_object(
      'lead_id',v_lead_id,'title','Cross-owner task','due_at',now()+interval '1 day'
    ));
    raise exception 'cross_owner_task_was_accepted';
  exception when sqlstate 'P0002' then
    null;
  end;

  v_task := public.dpf_create_follow_up_task_with_event(v_owner,jsonb_build_object(
    'lead_id',v_lead_id,'title','Call buyer','due_at',now()+interval '1 day','priority','high','channel','phone'
  ));
  v_task_id := (v_task->>'id')::uuid;
  select count(*) into v_events from public.dpf_lead_events
   where lead_id=v_lead_id and event_type='followup_scheduled';
  if v_events <> 1 then raise exception 'followup_create_audit_missing'; end if;

  begin
    perform public.dpf_update_follow_up_task_with_event(v_owner,v_task_id,jsonb_build_object('status','invalid_status'));
    raise exception 'invalid_followup_status_was_accepted';
  exception when check_violation then
    null;
  end;
  select status into v_status from public.dpf_follow_up_tasks where id=v_task_id;
  select count(*) into v_events from public.dpf_lead_events
   where lead_id=v_lead_id and event_type='followup_scheduled';
  if v_status <> 'pending' or v_events <> 1 then
    raise exception 'followup_failed_update_not_rolled_back';
  end if;

  v_updated := public.dpf_update_follow_up_task_with_event(v_owner,v_task_id,jsonb_build_object('status','completed'));
  select count(*) into v_events from public.dpf_lead_events
   where lead_id=v_lead_id and event_type='followup_scheduled';
  if v_updated->>'status' <> 'completed'
     or v_updated->>'completed_at' is null
     or v_events <> 2 then
    raise exception 'followup_completion_audit_mismatch';
  end if;
end;
$test$;
