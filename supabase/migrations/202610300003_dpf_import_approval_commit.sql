-- DPF Lead Vault approval and transactional import commit functions.
-- Review-only additive migration. Never apply to the live DPF project without approval.
-- Functions are callable only by the trusted server service_role. Server routes must
-- verify the caller's Supabase JWT and workspace role before invoking them.

alter table public.dpf_contact_import_batches
  add column if not exists snapshot_checksum text,
  add column if not exists approved_snapshot_checksum text;

alter table public.dpf_contact_import_rows
  add column if not exists supplied_name text,
  add column if not exists source_reference text;

create or replace function public.dpf_import_batch_snapshot_checksum(p_batch_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(
    coalesce((
      select pg_catalog.jsonb_build_object(
        'source_label', b.source_label,
        'source_type', b.source_type,
        'country_context', b.country_context,
        'rows', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_array(
              r.source_row_key,
              r.row_number,
              r.raw_phone,
              r.normalized_phone_e164,
              r.phone_validation_status,
              r.validation_reason,
              r.row_status,
              r.row_fingerprint,
              r.supplied_name,
              r.source_reference
            ) order by r.row_number
          )
          from public.dpf_contact_import_rows r
          where r.batch_id = b.id and r.owner_id = b.owner_id
        ), '[]'::jsonb)
      )::text
      from public.dpf_contact_import_batches b
      where b.id = p_batch_id
    ), '{}')
  );
$$;

create or replace function public.dpf_guard_approved_import_row_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_status text;
begin
  v_batch_id := case when tg_op = 'DELETE' then old.batch_id else new.batch_id end;
  select b.status into v_status
  from public.dpf_contact_import_batches b
  where b.id = v_batch_id;

  if v_status in ('approved','committing','committed')
     and coalesce(pg_catalog.current_setting('dpf.lead_vault_commit', true), '') <> 'on' then
    raise exception 'Approved import rows are immutable';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists dpf_import_rows_immutable_after_approval on public.dpf_contact_import_rows;
create trigger dpf_import_rows_immutable_after_approval
before insert or update or delete on public.dpf_contact_import_rows
for each row execute function public.dpf_guard_approved_import_row_changes();

create or replace function public.dpf_approve_contact_import_batch(
  p_batch_id uuid,
  p_actor_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.dpf_contact_import_batches%rowtype;
  v_checksum text;
  v_role text;
  v_rows integer;
  v_eligible integer;
begin
  if p_actor_id is null or p_request_id is null or pg_catalog.length(p_request_id) < 8 or pg_catalog.length(p_request_id) > 128 then
    raise exception 'Invalid approval actor or request ID';
  end if;

  select b.* into v_batch
  from public.dpf_contact_import_batches b
  where b.id = p_batch_id
  for update;

  if not found then raise exception 'Batch not found'; end if;

  select m.role into v_role
  from public.dpf_workspace_members m
  where m.owner_id = v_batch.owner_id
    and m.user_id = p_actor_id
    and m.membership_status = 'active'
    and m.role in ('owner','admin','reviewer')
  limit 1;

  if v_role is null then raise exception 'Actor is not authorized to approve this batch'; end if;

  if v_batch.status = 'approved' then
    v_checksum := public.dpf_import_batch_snapshot_checksum(p_batch_id);
    if v_batch.approved_snapshot_checksum = v_checksum then
      return pg_catalog.jsonb_build_object('ok',true,'already_approved',true,'batch_id',p_batch_id);
    end if;
    raise exception 'Approved batch snapshot mismatch';
  end if;

  if v_batch.status not in ('preview_ready','awaiting_approval') then
    raise exception 'Batch is not awaiting approval';
  end if;

  select count(*), count(*) filter (where row_status in ('valid','duplicate_in_batch'))
  into v_rows, v_eligible
  from public.dpf_contact_import_rows
  where batch_id = p_batch_id and owner_id = v_batch.owner_id;

  if v_rows = 0 or v_eligible = 0 then raise exception 'Batch has no eligible contact rows'; end if;

  if exists (
    select 1 from public.dpf_contact_import_rows
    where batch_id = p_batch_id and owner_id = v_batch.owner_id
      and row_status not in ('valid','duplicate_in_batch','skipped')
  ) then
    raise exception 'Batch contains unresolved rows; review or skip them before approval';
  end if;

  v_checksum := public.dpf_import_batch_snapshot_checksum(p_batch_id);

  update public.dpf_contact_import_batches
  set status = 'approved',
      approved_by = p_actor_id,
      approved_at = pg_catalog.now(),
      snapshot_checksum = v_checksum,
      approved_snapshot_checksum = v_checksum
  where id = p_batch_id;

  insert into public.dpf_lead_vault_audit_events(
    owner_id,actor_id,actor_type,action,entity_type,entity_id,batch_id,request_id,details
  ) values (
    v_batch.owner_id,p_actor_id,'human','batch.approve','import_batch',p_batch_id,p_batch_id,p_request_id,
    pg_catalog.jsonb_build_object('rows',v_rows,'eligible_rows',v_eligible,'snapshot_checksum',v_checksum)
  );

  return pg_catalog.jsonb_build_object('ok',true,'batch_id',p_batch_id,'approved_rows',v_eligible);
end;
$$;

create or replace function public.dpf_commit_contact_import_batch(
  p_batch_id uuid,
  p_actor_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.dpf_contact_import_batches%rowtype;
  v_role text;
  v_checksum text;
  v_contact_id uuid;
  v_created integer := 0;
  v_linked integer := 0;
  v_imported integer := 0;
  v_row record;
  v_result jsonb;
begin
  if p_actor_id is null or p_request_id is null or pg_catalog.length(p_request_id) < 8 or pg_catalog.length(p_request_id) > 128 then
    raise exception 'Invalid commit actor or request ID';
  end if;

  select b.* into v_batch
  from public.dpf_contact_import_batches b
  where b.id = p_batch_id
  for update;

  if not found then raise exception 'Batch not found'; end if;

  select m.role into v_role
  from public.dpf_workspace_members m
  where m.owner_id = v_batch.owner_id
    and m.user_id = p_actor_id
    and m.membership_status = 'active'
    and m.role in ('owner','admin')
  limit 1;

  if v_role is null then raise exception 'Actor is not authorized to commit this batch'; end if;

  if v_batch.status = 'committed' then
    select e.details into v_result
    from public.dpf_lead_vault_audit_events e
    where e.owner_id = v_batch.owner_id
      and e.batch_id = p_batch_id
      and e.action = 'batch.commit'
    order by e.created_at desc
    limit 1;
    return pg_catalog.jsonb_build_object('ok',true,'already_committed',true,'batch_id',p_batch_id,'result',coalesce(v_result,'{}'::jsonb));
  end if;

  if v_batch.status <> 'approved' then raise exception 'Only an approved batch can be committed'; end if;

  v_checksum := public.dpf_import_batch_snapshot_checksum(p_batch_id);
  if v_batch.approved_snapshot_checksum is null
     or v_batch.approved_snapshot_checksum <> v_checksum then
    raise exception 'Approved batch snapshot mismatch; commit refused';
  end if;

  perform pg_catalog.set_config('dpf.lead_vault_commit','on',true);
  update public.dpf_contact_import_batches set status = 'committing' where id = p_batch_id;

  for v_row in
    select r.*
    from public.dpf_contact_import_rows r
    where r.batch_id = p_batch_id
      and r.owner_id = v_batch.owner_id
      and r.phone_validation_status = 'valid'
      and r.normalized_phone_e164 is not null
      and r.row_status in ('valid','duplicate_in_batch')
    order by r.row_number
  loop
    v_contact_id := null;

    insert into public.dpf_contact_records(
      owner_id,phone_e164,phone_validation_status,full_name
    ) values (
      v_batch.owner_id,v_row.normalized_phone_e164,'valid',v_row.supplied_name
    )
    on conflict (owner_id,phone_e164) where phone_e164 is not null
    do nothing
    returning id into v_contact_id;

    if v_contact_id is not null then
      v_created := v_created + 1;
    else
      select c.id into v_contact_id
      from public.dpf_contact_records c
      where c.owner_id = v_batch.owner_id
        and c.phone_e164 = v_row.normalized_phone_e164
      limit 1;
      v_linked := v_linked + 1;
    end if;

    insert into public.dpf_contact_sources(
      owner_id,contact_id,import_row_id,source_type,source_label,source_reference,observed_at
    ) values (
      v_batch.owner_id,v_contact_id,v_row.id,v_batch.source_type,v_batch.source_label,v_row.source_reference,pg_catalog.now()
    )
    on conflict (import_row_id) where import_row_id is not null
    do nothing;

    update public.dpf_contact_import_rows
    set canonical_contact_id = v_contact_id, row_status = 'imported'
    where id = v_row.id and owner_id = v_batch.owner_id;

    v_imported := v_imported + 1;
  end loop;

  update public.dpf_contact_import_batches
  set status = 'committed', committed_at = pg_catalog.now()
  where id = p_batch_id;

  v_result := pg_catalog.jsonb_build_object(
    'created_contacts',v_created,
    'linked_contacts',v_linked,
    'imported_rows',v_imported
  );

  insert into public.dpf_lead_vault_audit_events(
    owner_id,actor_id,actor_type,action,entity_type,entity_id,batch_id,request_id,details
  ) values (
    v_batch.owner_id,p_actor_id,'human','batch.commit','import_batch',p_batch_id,p_batch_id,p_request_id,v_result
  );

  return pg_catalog.jsonb_build_object('ok',true,'batch_id',p_batch_id,'result',v_result);
end;
$$;

revoke all on function public.dpf_import_batch_snapshot_checksum(uuid) from public, anon, authenticated;
revoke all on function public.dpf_guard_approved_import_row_changes() from public, anon, authenticated;
revoke all on function public.dpf_approve_contact_import_batch(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.dpf_commit_contact_import_batch(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.dpf_approve_contact_import_batch(uuid,uuid,text) to service_role;
grant execute on function public.dpf_commit_contact_import_batch(uuid,uuid,text) to service_role;

comment on function public.dpf_import_batch_snapshot_checksum(uuid) is
  'MD5 snapshot checksum for accidental-change detection, not a cryptographic signature. Trusted server validation and restricted DB writes remain required.';
comment on function public.dpf_approve_contact_import_batch(uuid,uuid,text) is
  'Approve a resolved immutable batch. Service-role only; validates active owner/admin/reviewer membership and writes an audit event.';
comment on function public.dpf_commit_contact_import_batch(uuid,uuid,text) is
  'Atomically create/link contacts and provenance for an approved batch. Service-role only; validates active owner/admin membership and is retry-safe.';
