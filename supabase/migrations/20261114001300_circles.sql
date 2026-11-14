-- Circles: a person and up to 5 friends. Weekly leaderboard from existing reward points,
-- a small shared feed (finished days, streaks, comebacks, missed days) with cheers and nudges.
-- Friends only ever see names, points, streaks and these posts: never plans, items or messages.
-- All writes go through server code with the service role after verifying the session.

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  name text not null default 'My circle' check (char_length(name) between 1 and 60),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  -- One circle per person keeps the leaderboard simple.
  user_id uuid not null unique references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index circle_members_circle on public.circle_members (circle_id);

-- Owner + 5 friends. The row lock serialises concurrent joins to the same circle.
create or replace function public.enforce_circle_size() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.circles where id = new.circle_id for update;
  if (select count(*) from public.circle_members where circle_id = new.circle_id) >= 6 then
    raise exception 'circle_full' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_circle_size() from public, anon, authenticated;
create trigger circle_members_size before insert on public.circle_members
  for each row execute function public.enforce_circle_size();

create table public.circle_posts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('joined', 'day_done', 'streak', 'milestone', 'missed', 'comeback', 'note')),
  body text check (char_length(body) <= 280),
  meta jsonb not null default '{}'::jsonb,
  dedupe_key text unique check (char_length(dedupe_key) <= 160),
  created_at timestamptz not null default now()
);
create index circle_posts_feed on public.circle_posts (circle_id, created_at desc);

create table public.circle_reactions (
  post_id uuid not null references public.circle_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('cheer', 'fire', 'hug', 'nudge')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

-- The caller's circle, for RLS without self-referencing policies.
create or replace function public.my_circle_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select circle_id from public.circle_members where user_id = (select auth.uid())
$$;
revoke all on function public.my_circle_id() from public, anon;
grant execute on function public.my_circle_id() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['circles', 'circle_members', 'circle_posts', 'circle_reactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create policy circles_select_member on public.circles for select to authenticated using (id = (select public.my_circle_id()));
create policy circle_members_select_member on public.circle_members for select to authenticated using (circle_id = (select public.my_circle_id()));
create policy circle_posts_select_member on public.circle_posts for select to authenticated using (circle_id = (select public.my_circle_id()));
create policy circle_reactions_select_member on public.circle_reactions for select to authenticated using (
  exists (select 1 from public.circle_posts p where p.id = post_id and p.circle_id = (select public.my_circle_id()))
);
