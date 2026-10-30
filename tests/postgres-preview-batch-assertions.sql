-- Atomic preview creation and idempotency smoke test. Run after migration 004.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000005');

insert into public.dpf_workspace_members(owner_id,user_id,role,membership_status)
values ('00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000005','operator','active');

do $$
declare
  v_first jsonb;
  v_retry jsonb;
  v_batch_id uuid;
  v_count integer;
  v_status text;
begin
  if has_function_privilege('authenticated',
      'public.dpf_create_contact_import_batch(uuid,uuid,text,text,text,text,jsonb)','EXECUTE') then
    raise exception 'authenticated unexpectedly can execute preview batch RPC';
  end if;

  v_first := public.dpf_create_contact_import_batch(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000005',
    'operator-preview-request',
    'Preview batch test',
    'Imported CSV test',
    'NG',
    '[
      {"source_row_key":"row-2","row_number":2,"raw_phone":"08015550001","normalized_phone_e164":"+2348015550001","phone_validation_status":"valid","validation_reason":null,"row_status":"valid","row_fingerprint":"sha256-a","supplied_name":"First","source_reference":"ref-a"},
      {"source_row_key":"row-3","row_number":3,"raw_phone":"08015550001","normalized_phone_e164":"+2348015550001","phone_validation_status":"valid","validation_reason":null,"row_status":"duplicate_in_batch","row_fingerprint":"sha256-b","supplied_name":"Duplicate","source_reference":"ref-b"},
      {"source_row_key":"row-4","row_number":4,"raw_phone":"123","normalized_phone_e164":null,"phone_validation_status":"needs_review","validation_reason":"ambiguous_number","row_status":"needs_review","row_fingerprint":"sha256-c","supplied_name":null,"source_reference":null}
    ]'::jsonb
  );

  v_batch_id := (v_first->>'batch_id')::uuid;
  v_retry := public.dpf_create_contact_import_batch(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000005',
    'operator-preview-request',
    'Preview batch test',
    'Imported CSV test',
    'NG',
    '[]'::jsonb
  );

  if (v_retry->>'batch_id')::uuid <> v_batch_id or (v_retry->>'already_created')::boolean is not true then
    raise exception 'Preview retry did not return the original batch';
  end if;

  select count(*) into v_count from public.dpf_contact_import_rows where batch_id=v_batch_id;
  if v_count <> 3 then raise exception 'Expected 3 preserved source rows, found %',v_count; end if;

  select status into v_status from public.dpf_contact_import_batches where id=v_batch_id;
  if v_status <> 'preview_ready' then raise exception 'Preview batch was not marked preview_ready'; end if;

  if (v_first->'counts'->>'valid_rows')::integer <> 1
     or (v_first->'counts'->>'duplicate_rows')::integer <> 1
     or (v_first->'counts'->>'review_rows')::integer <> 1 then
    raise exception 'Preview counts do not match expected values';
  end if;

  begin
    perform public.dpf_create_contact_import_batch(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000004',
      'reviewer-preview-request',
      null,'Reviewer attempt',null,
      '[{"source_row_key":"r1","row_number":2,"raw_phone":"0801","phone_validation_status":"needs_review","row_status":"needs_review","row_fingerprint":"fp"}]'::jsonb
    );
    raise exception 'Reviewer unexpectedly created a preview batch';
  exception when raise_exception then
    if sqlerrm not like '%not authorized%' then raise; end if;
  end;
end;
$$;
