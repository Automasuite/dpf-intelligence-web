-- Post-migration structural, privilege, tenant-isolation and idempotency checks.
do $$
declare
  v_enabled integer;
  v_policies integer;
begin
  select count(*) into v_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'dpf_contact_records','dpf_contact_import_batches','dpf_contact_import_rows',
      'dpf_contact_sources','dpf_contact_permissions','dpf_contact_suppressions',
      'dpf_lead_vault_audit_events'
    )
    and c.relrowsecurity;
  if v_enabled <> 7 then
    raise exception 'Expected RLS enabled on 7 tables, found %', v_enabled;
  end if;

  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'dpf_contact_records','dpf_contact_import_batches','dpf_contact_import_rows',
      'dpf_contact_sources','dpf_contact_permissions','dpf_contact_suppressions',
      'dpf_lead_vault_audit_events'
    )
    and policyname like '%owner_read';
  if v_policies <> 7 then
    raise exception 'Expected 7 owner-read policies, found %', v_policies;
  end if;

  if has_table_privilege('anon','public.dpf_contact_records','SELECT') then
    raise exception 'anon unexpectedly has SELECT';
  end if;
  if not has_table_privilege('authenticated','public.dpf_contact_records','SELECT') then
    raise exception 'authenticated is missing SELECT';
  end if;
  if has_table_privilege('authenticated','public.dpf_contact_records','INSERT') then
    raise exception 'authenticated unexpectedly has INSERT';
  end if;
  if not has_table_privilege('service_role','public.dpf_contact_records','INSERT') then
    raise exception 'service_role is missing INSERT';
  end if;
end;
$$;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

insert into public.dpf_contact_records(owner_id, phone_e164, phone_validation_status, full_name)
values
  ('00000000-0000-4000-8000-000000000001', '+2348012345678', 'valid', 'Owner One'),
  ('00000000-0000-4000-8000-000000000002', '+2348098765432', 'valid', 'Owner Two');

-- An authenticated owner can read only their own row.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$
begin
  if (select count(*) from public.dpf_contact_records) <> 1 then
    raise exception 'RLS tenant isolation failed: owner saw another owner record or no own record';
  end if;
end;
$$;
reset role;

-- A source row cannot attach to another owner's batch/contact.
insert into public.dpf_contact_import_batches(id, owner_id, source_label)
values ('10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001','test batch');

do $$
begin
  begin
    insert into public.dpf_contact_import_rows(
      owner_id,batch_id,source_row_key,row_number,row_fingerprint
    ) values (
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'cross-tenant-row',1,'fingerprint'
    );
    raise exception 'Cross-tenant batch link unexpectedly succeeded';
  exception when foreign_key_violation then
    null;
  end;
end;
$$;

-- Manual provenance with NULL import_row_id must still be idempotent.
insert into public.dpf_contact_sources(owner_id,contact_id,source_type,source_label)
values ('00000000-0000-4000-8000-000000000001',
        (select id from public.dpf_contact_records where owner_id='00000000-0000-4000-8000-000000000001'),
        'manual_entry','operator supplied');

do $$
begin
  begin
    insert into public.dpf_contact_sources(owner_id,contact_id,source_type,source_label)
    values ('00000000-0000-4000-8000-000000000001',
            (select id from public.dpf_contact_records where owner_id='00000000-0000-4000-8000-000000000001'),
            'manual_entry','operator supplied');
    raise exception 'Duplicate manual provenance unexpectedly succeeded';
  exception when unique_violation then
    null;
  end;
end;
$$;
