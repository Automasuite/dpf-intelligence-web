-- DPF Lead Vault durable preview-batch creation.
-- Review-only additive migration. Does not import contacts or grant live access.
-- The trusted server performs CSV parsing/normalization; this RPC validates role,
-- stores every source row atomically, calculates counts, and audits the preview.

create or replace function public.dpf_create_contact_import_batch(
  p_owner_id uuid,
  p_actor_id uuid,
  p_request_id text,
  p_batch_name text,
  p_source_label text,
  p_country_context text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_existing public.dpf_lead_vault_audit_events%rowtype;
  v_batch_id uuid;
  v_total integer;
  v_valid integer;
  v_review integer;
  v_invalid integer;
  v_duplicates integer;
  v_details jsonb;
  v_request_fingerprint text;
begin
  if p_owner_id is null or p_actor_id is null
     or p_request_id is null or pg_catalog.length(p_request_id) < 8 or pg_catalog.length(p_request_id) > 128
     or p_source_label is null or pg_catalog.length(pg_catalog.btrim(p_source_label)) = 0
     or pg_catalog.length(p_source_label) > 160 then
    raise exception 'Invalid preview batch metadata';
  end if;

  if p_batch_name is not null and pg_catalog.length(p_batch_name) > 120 then
    raise exception 'Batch name is too long';
  end if;

  if p_country_context is not null and p_country_context not in ('NG') then
    raise exception 'Unsupported country context';
  end if;

  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a JSON array';
  end if;

  v_request_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'batch_name',p_batch_name,
      'source_label',p_source_label,
      'country_context',p_country_context,
      'rows',p_rows
    )::text
  );

  select m.role into v_role
  from public.dpf_workspace_members m
  where m.owner_id = p_owner_id
    and m.user_id = p_actor_id
    and m.membership_status = 'active'
    and m.role in ('owner','admin','operator')
  limit 1;

  if v_role is null then raise exception 'Actor is not authorized to preview this batch'; end if;

  select e.* into v_existing
  from public.dpf_lead_vault_audit_events e
  where e.owner_id = p_owner_id
    and e.request_id = p_request_id
    and e.action = 'batch.preview'
  limit 1;

  if found then
    if v_existing.details->>'request_fingerprint' is distinct from v_request_fingerprint then
      raise exception 'Idempotency key reused with a different request payload';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok',true,'already_created',true,'batch_id',v_existing.entity_id,
      'counts',v_existing.details - 'request_fingerprint'
    );
  end if;

  v_total := pg_catalog.jsonb_array_length(p_rows);
  if v_total < 1 or v_total > 10000 then
    raise exception 'Batch row count is outside the allowed range';
  end if;

  v_batch_id := pg_catalog.gen_random_uuid();

  insert into public.dpf_contact_import_batches(
    id,owner_id,batch_name,source_label,source_type,country_context,status,total_rows
  ) values (
    v_batch_id,p_owner_id,nullif(pg_catalog.btrim(p_batch_name),''),pg_catalog.btrim(p_source_label),
    'user_supplied',p_country_context,'validating',v_total
  );

  insert into public.dpf_contact_import_rows(
    owner_id,batch_id,source_row_key,row_number,raw_phone,normalized_phone_e164,
    phone_validation_status,validation_reason,row_status,row_fingerprint,
    supplied_name,source_reference
  )
  select
    p_owner_id,v_batch_id,x.source_row_key,x.row_number,x.raw_phone,x.normalized_phone_e164,
    x.phone_validation_status,x.validation_reason,x.row_status,x.row_fingerprint,
    x.supplied_name,x.source_reference
  from pg_catalog.jsonb_to_recordset(p_rows) as x(
    source_row_key text,
    row_number integer,
    raw_phone text,
    normalized_phone_e164 text,
    phone_validation_status text,
    validation_reason text,
    row_status text,
    row_fingerprint text,
    supplied_name text,
    source_reference text
  );

  select
    count(*) filter (where row_status = 'valid'),
    count(*) filter (where row_status = 'needs_review'),
    count(*) filter (where phone_validation_status = 'invalid'),
    count(*) filter (where row_status = 'duplicate_in_batch')
  into v_valid,v_review,v_invalid,v_duplicates
  from public.dpf_contact_import_rows
  where batch_id = v_batch_id and owner_id = p_owner_id;

  update public.dpf_contact_import_batches
  set status = 'preview_ready',
      valid_rows = v_valid,
      review_rows = v_review,
      invalid_rows = v_invalid,
      duplicate_rows = v_duplicates
  where id = v_batch_id;

  v_details := pg_catalog.jsonb_build_object(
    'total_rows',v_total,
    'valid_rows',v_valid,
    'review_rows',v_review,
    'invalid_rows',v_invalid,
    'duplicate_rows',v_duplicates,
    'request_fingerprint',v_request_fingerprint
  );

  insert into public.dpf_lead_vault_audit_events(
    owner_id,actor_id,actor_type,action,entity_type,entity_id,batch_id,request_id,details
  ) values (
    p_owner_id,p_actor_id,'human','batch.preview','import_batch',v_batch_id,v_batch_id,p_request_id,v_details
  );

  return pg_catalog.jsonb_build_object('ok',true,'already_created',false,'batch_id',v_batch_id,'counts',v_details - 'request_fingerprint');
end;
$$;

revoke all on function public.dpf_create_contact_import_batch(uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.dpf_create_contact_import_batch(uuid,uuid,text,text,text,text,jsonb) to service_role;

comment on function public.dpf_create_contact_import_batch(uuid,uuid,text,text,text,text,jsonb) is
  'Atomically creates a durable, audited preview batch and its source rows. Does not create canonical contacts or send messages.';
