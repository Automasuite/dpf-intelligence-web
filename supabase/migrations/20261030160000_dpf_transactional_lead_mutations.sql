-- DPF transactional lead mutations.
-- Functions are SECURITY INVOKER and callable only by the server-side service_role.
-- Each lead mutation and its audit event commit or roll back together.

create or replace function public.dpf_create_lead_with_event(
  p_owner_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.dpf_leads%rowtype;
  v_allowed text[] := array[
    'full_name','phone','email','source','stage','budget_amount','currency_code',
    'preferred_location','property_type','buying_timeline','purpose','payment_preference',
    'motivation','risk_or_objection','next_action_at','next_action_summary',
    'consent_status','record_status'
  ];
  v_key text;
begin
  if p_owner_id is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_lead_payload' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'invalid_lead_field' using errcode = '22023';
    end if;
  end loop;
  if nullif(btrim(p_payload->>'full_name'), '') is null
     or nullif(btrim(p_payload->>'phone'), '') is null
     or nullif(btrim(p_payload->>'source'), '') is null then
    raise exception 'required_lead_fields_missing' using errcode = '22023';
  end if;

  insert into public.dpf_leads (
    owner_id, full_name, phone, email, source, stage, budget_amount, currency_code,
    preferred_location, property_type, buying_timeline, purpose, payment_preference,
    motivation, risk_or_objection, next_action_at, next_action_summary,
    consent_status, record_status
  ) values (
    p_owner_id, btrim(p_payload->>'full_name'), btrim(p_payload->>'phone'),
    nullif(p_payload->>'email',''), coalesce(nullif(btrim(p_payload->>'source'),''),'manual_entry'),
    coalesce(nullif(p_payload->>'stage',''),'signal'),
    nullif(p_payload->>'budget_amount','')::numeric,
    coalesce(nullif(p_payload->>'currency_code',''),'NGN'),
    p_payload->>'preferred_location', p_payload->>'property_type',
    p_payload->>'buying_timeline', p_payload->>'purpose', p_payload->>'payment_preference',
    p_payload->>'motivation', p_payload->>'risk_or_objection',
    nullif(p_payload->>'next_action_at','')::timestamptz,
    p_payload->>'next_action_summary',
    coalesce(nullif(p_payload->>'consent_status',''),'unknown'),
    coalesce(nullif(p_payload->>'record_status',''),'active')
  ) returning * into v_lead;

  insert into public.dpf_lead_events (
    owner_id, lead_id, event_type, actor_type, summary, new_value, requires_approval
  ) values (
    p_owner_id, v_lead.id, 'created', 'human',
    'Lead record created by an authenticated workspace user.',
    jsonb_build_object('stage',v_lead.stage,'source',v_lead.source),
    false
  );
  return to_jsonb(v_lead);
end;
$$;

create or replace function public.dpf_update_lead_with_event(
  p_owner_id uuid,
  p_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.dpf_leads%rowtype;
  v_after public.dpf_leads%rowtype;
  v_allowed text[] := array[
    'full_name','phone','email','source','stage','budget_amount','currency_code',
    'preferred_location','property_type','buying_timeline','purpose','payment_preference',
    'motivation','risk_or_objection','next_action_at','next_action_summary',
    'consent_status','record_status'
  ];
  v_key text;
  v_event_type text := 'qualification_updated';
  v_summary text := 'Lead details updated by an authenticated workspace user.';
begin
  if p_owner_id is null or p_lead_id is null or jsonb_typeof(p_payload) <> 'object'
     or p_payload = '{}'::jsonb then
    raise exception 'invalid_lead_update' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'invalid_lead_field' using errcode = '22023';
    end if;
  end loop;

  select * into v_before
  from public.dpf_leads
  where id = p_lead_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  update public.dpf_leads set
    full_name = case when p_payload ? 'full_name' then p_payload->>'full_name' else full_name end,
    phone = case when p_payload ? 'phone' then p_payload->>'phone' else phone end,
    email = case when p_payload ? 'email' then nullif(p_payload->>'email','') else email end,
    source = case when p_payload ? 'source' then p_payload->>'source' else source end,
    stage = case when p_payload ? 'stage' then p_payload->>'stage' else stage end,
    budget_amount = case when p_payload ? 'budget_amount' then nullif(p_payload->>'budget_amount','')::numeric else budget_amount end,
    currency_code = case when p_payload ? 'currency_code' then p_payload->>'currency_code' else currency_code end,
    preferred_location = case when p_payload ? 'preferred_location' then p_payload->>'preferred_location' else preferred_location end,
    property_type = case when p_payload ? 'property_type' then p_payload->>'property_type' else property_type end,
    buying_timeline = case when p_payload ? 'buying_timeline' then p_payload->>'buying_timeline' else buying_timeline end,
    purpose = case when p_payload ? 'purpose' then p_payload->>'purpose' else purpose end,
    payment_preference = case when p_payload ? 'payment_preference' then p_payload->>'payment_preference' else payment_preference end,
    motivation = case when p_payload ? 'motivation' then p_payload->>'motivation' else motivation end,
    risk_or_objection = case when p_payload ? 'risk_or_objection' then p_payload->>'risk_or_objection' else risk_or_objection end,
    next_action_at = case when p_payload ? 'next_action_at' then nullif(p_payload->>'next_action_at','')::timestamptz else next_action_at end,
    next_action_summary = case when p_payload ? 'next_action_summary' then p_payload->>'next_action_summary' else next_action_summary end,
    consent_status = case when p_payload ? 'consent_status' then p_payload->>'consent_status' else consent_status end,
    record_status = case when p_payload ? 'record_status' then p_payload->>'record_status' else record_status end
  where id = p_lead_id and owner_id = p_owner_id
  returning * into v_after;

  if v_before.stage is distinct from v_after.stage then
    v_event_type := 'stage_changed';
    v_summary := 'Lead stage changed by an authenticated workspace user.';
  elsif v_before.record_status is distinct from v_after.record_status
        and v_after.record_status = 'archived' then
    v_event_type := 'record_archived';
    v_summary := 'Lead record archived by an authenticated workspace user.';
  elsif v_before.consent_status is distinct from v_after.consent_status then
    v_event_type := 'consent_changed';
    v_summary := 'Lead contact-permission status changed by an authenticated workspace user.';
  end if;

  insert into public.dpf_lead_events (
    owner_id, lead_id, event_type, actor_type, summary, previous_value, new_value, requires_approval
  ) values (
    p_owner_id, v_after.id, v_event_type, 'human', v_summary,
    to_jsonb(v_before), to_jsonb(v_after), false
  );
  return to_jsonb(v_after);
end;
$$;

revoke all on function public.dpf_create_lead_with_event(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.dpf_update_lead_with_event(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.dpf_create_lead_with_event(uuid,jsonb) to service_role;
grant execute on function public.dpf_update_lead_with_event(uuid,uuid,jsonb) to service_role;
