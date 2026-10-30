-- Transactional audited lead mutation assertions on disposable PostgreSQL.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');

do $test$
declare
  v_owner uuid := '00000000-0000-4000-8000-000000000001';
  v_lead jsonb;
  v_updated jsonb;
  v_id uuid;
  v_events integer;
  v_stage text;
begin
  if has_function_privilege('anon','public.dpf_create_lead_with_event(uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.dpf_create_lead_with_event(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.dpf_create_lead_with_event(uuid,jsonb)','EXECUTE') then
    raise exception 'create_function_grants_invalid';
  end if;
  if has_function_privilege('anon','public.dpf_update_lead_with_event(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.dpf_update_lead_with_event(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.dpf_update_lead_with_event(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'update_function_grants_invalid';
  end if;

  v_lead := public.dpf_create_lead_with_event(v_owner, jsonb_build_object(
    'full_name','Disposable Test Lead','phone','+2340000000000','source','ci_test'
  ));
  v_id := (v_lead->>'id')::uuid;
  select count(*) into v_events from public.dpf_lead_events where lead_id=v_id;
  if v_events <> 1 then raise exception 'create_audit_missing'; end if;

  begin
    perform public.dpf_update_lead_with_event(v_owner,v_id,jsonb_build_object('stage','invalid_stage'));
    raise exception 'invalid_stage_was_accepted';
  exception when check_violation then
    null;
  end;

  select stage into v_stage from public.dpf_leads where id=v_id;
  select count(*) into v_events from public.dpf_lead_events where lead_id=v_id;
  if v_stage <> 'signal' or v_events <> 1 then
    raise exception 'failed_update_was_not_rolled_back';
  end if;

  v_updated := public.dpf_update_lead_with_event(v_owner,v_id,jsonb_build_object('stage','intent'));
  select count(*) into v_events from public.dpf_lead_events where lead_id=v_id;
  if v_updated->>'stage' <> 'intent' or v_events <> 2 then
    raise exception 'successful_update_audit_mismatch';
  end if;
end;
$test$;
