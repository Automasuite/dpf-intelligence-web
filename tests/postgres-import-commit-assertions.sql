-- Transactional approval/commit smoke test. Run after migration 003.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000004');

insert into public.dpf_workspace_members(owner_id,user_id,role,membership_status)
values ('00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000004','reviewer','active');

insert into public.dpf_contact_import_batches(
  id,owner_id,source_label,source_type,status,total_rows,valid_rows
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'test csv batch','user_supplied','preview_ready',3,3
);

insert into public.dpf_contact_import_rows(
  owner_id,batch_id,source_row_key,row_number,raw_phone,normalized_phone_e164,
  phone_validation_status,row_status,row_fingerprint,supplied_name,source_reference
) values
  ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   'row-2',2,'08011111111','+2348011111111','valid','valid','fingerprint-2','New Contact','source-2'),
  ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   'row-3',3,'08012345678','+2348012345678','valid','valid','fingerprint-3','Updated Name Must Not Overwrite','source-3'),
  ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   'row-4',4,'08011111111','+2348011111111','valid','duplicate_in_batch','fingerprint-4','Duplicate Source Row','source-4');

do $$
begin
  if has_function_privilege('authenticated',
      'public.dpf_approve_contact_import_batch(uuid,uuid,text)','EXECUTE') then
    raise exception 'authenticated unexpectedly can execute batch approval';
  end if;
  if not has_function_privilege('service_role',
      'public.dpf_approve_contact_import_batch(uuid,uuid,text)','EXECUTE') then
    raise exception 'service_role cannot execute batch approval';
  end if;
end;
$$;

set role service_role;
do $$
begin
  begin
    perform public.dpf_approve_contact_import_batch(
      '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003',
      'operator-approval-request'
    );
    raise exception 'Operator unexpectedly approved a batch';
  exception when raise_exception then
    if sqlerrm not like '%not authorized%' then raise; end if;
  end;
end;
$$;

select public.dpf_approve_contact_import_batch(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  'reviewer-approval-request'
);

do $$
begin
  begin
    update public.dpf_contact_import_rows
    set supplied_name='tampered after approval'
    where batch_id='20000000-0000-4000-8000-000000000001'
      and source_row_key='row-2';
    raise exception 'Approved batch row was mutable';
  exception when raise_exception then
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
end;
$$;

select public.dpf_commit_contact_import_batch(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'owner-commit-request'
);

select public.dpf_commit_contact_import_batch(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'owner-commit-retry'
);

reset role;

do $$
declare
  v_contacts integer;
  v_rows integer;
  v_sources integer;
  v_status text;
  v_existing_name text;
begin
  select count(*) into v_contacts from public.dpf_contact_records
  where owner_id='00000000-0000-4000-8000-000000000001';
  if v_contacts <> 2 then raise exception 'Expected two canonical contacts after commit, found %',v_contacts; end if;

  select count(*) into v_rows from public.dpf_contact_import_rows
  where batch_id='20000000-0000-4000-8000-000000000001' and row_status='imported';
  if v_rows <> 3 then raise exception 'Expected three imported provenance rows, found %',v_rows; end if;

  select count(*) into v_sources from public.dpf_contact_sources
  where import_row_id in (
    select id from public.dpf_contact_import_rows
    where batch_id='20000000-0000-4000-8000-000000000001'
  );
  if v_sources <> 3 then raise exception 'Expected three source provenance records, found %',v_sources; end if;

  select status into v_status from public.dpf_contact_import_batches
  where id='20000000-0000-4000-8000-000000000001';
  if v_status <> 'committed' then raise exception 'Batch status is not committed'; end if;

  select full_name into v_existing_name from public.dpf_contact_records
  where owner_id='00000000-0000-4000-8000-000000000001'
    and phone_e164='+2348012345678';
  if v_existing_name <> 'Owner One' then raise exception 'Existing contact data was overwritten'; end if;
end;
$$;
