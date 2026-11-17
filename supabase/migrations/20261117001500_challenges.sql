-- Challenges: a circle with fixed dates, a prize and no 6-person limit, created by an
-- operator from /admin. People join with the same 5-digit code. The leaderboard counts
-- points earned between starts_on and ends_on (IST). Challenges don't count toward the
-- 5-circles-per-person limit.

alter table public.circles
  add column if not exists kind text not null default 'circle' check (kind in ('circle', 'challenge')),
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists prize text check (char_length(prize) <= 120);
alter table public.circles drop constraint if exists circles_challenge_dates;
alter table public.circles add constraint circles_challenge_dates check (kind <> 'challenge' or (starts_on is not null and ends_on is not null and ends_on >= starts_on));

create or replace function public.enforce_circle_size() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  select kind into k from public.circles where id = new.circle_id for update;
  if (select count(*) from public.circle_members where circle_id = new.circle_id) >= (case when k = 'challenge' then 500 else 6 end) then
    raise exception 'circle_full' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.enforce_circle_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select kind from public.circles where id = new.circle_id) = 'challenge' then
    return new;
  end if;
  if (select count(*) from public.circle_members m join public.circles c on c.id = m.circle_id
       where m.user_id = new.user_id and c.kind = 'circle') >= 5 then
    raise exception 'too_many_circles' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Feed posts for the challenge's start, last day and result.
alter table public.circle_posts drop constraint if exists circle_posts_kind_check;
alter table public.circle_posts add constraint circle_posts_kind_check
  check (kind in ('joined', 'day_done', 'streak', 'milestone', 'missed', 'comeback', 'note', 'challenge_start', 'challenge_last_day', 'challenge_end'));
-- Challenge announcements have no author.
alter table public.circle_posts alter column user_id drop not null;
