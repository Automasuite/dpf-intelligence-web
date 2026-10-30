-- Apply after migration 202610300002_dpf_workspace_membership.sql.
-- Verify active workspace membership grants read access while suspended members do not.

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000003');

insert into public.dpf_workspace_members(owner_id,user_id,role,membership_status)
values
  ('00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001','owner','active'),
  ('00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000003','operator','active'),
  ('00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002','owner','active');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$
begin
  if (select count(*) from public.dpf_contact_records) <> 1 then
    raise exception 'Active workspace member did not see exactly the workspace contact';
  end if;
  if (select count(*) from public.dpf_workspace_members) <> 1 then
    raise exception 'Member can see unexpected workspace membership rows';
  end if;
  if has_table_privilege(current_user,'public.dpf_workspace_members','INSERT') then
    raise exception 'Authenticated member unexpectedly has membership INSERT';
  end if;
end;
$$;
reset role;

update public.dpf_workspace_members
set membership_status='suspended'
where owner_id='00000000-0000-4000-8000-000000000001'
  and user_id='00000000-0000-4000-8000-000000000003';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$
begin
  if (select count(*) from public.dpf_contact_records) <> 0 then
    raise exception 'Suspended member can still read workspace contacts';
  end if;
end;
$$;
reset role;
