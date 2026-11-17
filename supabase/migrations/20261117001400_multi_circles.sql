-- Several circles per person (family, office friends, gym...), each joinable with a short
-- 5-digit code. Old 8-character invite codes keep working until the owner makes a new code.

-- 1. A person can now be in more than one circle (up to 5).
alter table public.circle_members drop constraint if exists circle_members_user_id_key;
create index if not exists circle_members_user on public.circle_members (user_id);

create or replace function public.enforce_circle_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.circle_members where user_id = new.user_id) >= 5 then
    raise exception 'too_many_circles' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_circle_count() from public, anon, authenticated;
drop trigger if exists circle_members_count on public.circle_members;
create trigger circle_members_count before insert on public.circle_members
  for each row execute function public.enforce_circle_count();

-- 2. Short numeric codes alongside the legacy 8-character ones.
alter table public.circles drop constraint if exists circles_invite_code_check;
alter table public.circles add constraint circles_invite_code_check check (invite_code ~ '^([A-Z0-9]{8}|[0-9]{5})$');

-- 3. Read access follows membership in any of the caller's circles.
create or replace function public.my_circle_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select circle_id from public.circle_members where user_id = (select auth.uid())
$$;
revoke all on function public.my_circle_ids() from public, anon;
grant execute on function public.my_circle_ids() to authenticated;

drop policy if exists circles_select_member on public.circles;
drop policy if exists circle_members_select_member on public.circle_members;
drop policy if exists circle_posts_select_member on public.circle_posts;
drop policy if exists circle_reactions_select_member on public.circle_reactions;
create policy circles_select_member on public.circles for select to authenticated using (id in (select public.my_circle_ids()));
create policy circle_members_select_member on public.circle_members for select to authenticated using (circle_id in (select public.my_circle_ids()));
create policy circle_posts_select_member on public.circle_posts for select to authenticated using (circle_id in (select public.my_circle_ids()));
create policy circle_reactions_select_member on public.circle_reactions for select to authenticated using (
  exists (select 1 from public.circle_posts p where p.id = post_id and p.circle_id in (select public.my_circle_ids()))
);
drop function if exists public.my_circle_id();
