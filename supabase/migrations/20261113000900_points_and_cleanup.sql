-- 1. Stored points total. Pages used to add up every reward row on each load; the total is
--    now kept on the profile by a trigger (reward rows are append-only and never negative).
alter table public.profiles add column if not exists points_total integer not null default 0;

update public.profiles p
   set points_total = coalesce((select sum(greatest(r.points, 0)) from public.reward_events r where r.user_id = p.id), 0);

create or replace function public._add_reward_points() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set points_total = points_total + greatest(new.points, 0) where id = new.user_id;
  return new;
end $$;

drop trigger if exists reward_events_points_total on public.reward_events;
create trigger reward_events_points_total after insert on public.reward_events
  for each row execute function public._add_reward_points();

-- 2. Orphaned video proof. Videos are uploaded straight from the browser before the evidence
--    row exists; if that second step fails the file stays behind. The worker lists such files
--    (no documents row, older than a few hours) and deletes them through the Storage API.
create or replace function public.orphan_evidence_videos(p_older_than interval default '6 hours', p_limit int default 200)
returns table (name text)
language sql security definer set search_path = '' stable as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'evidence'
     and o.name ~* '\.(mp4|webm|mov)$'
     and o.created_at < now() - p_older_than
     and not exists (select 1 from public.documents d where d.bucket = 'evidence' and d.storage_path = o.name)
   order by o.created_at
   limit greatest(1, least(p_limit, 1000));
$$;
revoke all on function public.orphan_evidence_videos(interval, int) from public, anon, authenticated;
grant execute on function public.orphan_evidence_videos(interval, int) to service_role;
