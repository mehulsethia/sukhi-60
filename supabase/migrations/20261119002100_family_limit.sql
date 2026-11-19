-- Family: at most 2 per patient (pending invites count), and every family member sees
-- everything family can see (weekly summary, points, alerts). Family stays read-only.

update public.family_access set scopes = array['weekly_summary', 'garden', 'alerts']
 where status in ('invited', 'active');
alter table public.family_access alter column scopes set default array['weekly_summary', 'garden', 'alerts'];

create or replace function public.enforce_family_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seats int;
begin
  if tg_op = 'UPDATE' and not (new.status = 'active' and old.status is distinct from 'active') then
    return new;
  end if;
  -- One patient at a time, so two invites created at once can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtext('family:' || new.patient_id::text));
  select count(*) into seats
    from public.family_access f
   where f.patient_id = new.patient_id
     and f.id <> new.id
     and (f.status = 'active' or (f.status = 'invited' and f.expires_at > now()));
  if seats >= 2 then
    raise exception 'family_limit' using errcode = 'P0001', hint = 'A patient can share with at most 2 family members.';
  end if;
  return new;
end $$;
revoke all on function public.enforce_family_limit() from public, anon, authenticated;

drop trigger if exists family_access_limit on public.family_access;
create trigger family_access_limit before insert or update of status on public.family_access
  for each row execute function public.enforce_family_limit();
