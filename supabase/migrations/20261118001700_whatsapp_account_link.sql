-- Link a WhatsApp number to an existing web account, both ways, and merge an account that
-- was created on WhatsApp into the web account the person already had.

-- One-time links sent to a WhatsApp number ("open this, log in, confirm"). The link proves the
-- number (only that chat received it); logging in proves the account.
create table if not exists public.wa_connect_requests (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  external_id text not null check (external_id ~ '^[0-9]{6,20}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists wa_connect_requests_number on public.wa_connect_requests (external_id, created_at desc);
alter table public.wa_connect_requests enable row level security;
alter table public.wa_connect_requests force row level security;
revoke all on public.wa_connect_requests from anon, authenticated;
grant all on public.wa_connect_requests to service_role;

-- Plan items keep their owner, except while two accounts are being merged.
create or replace function public.guard_plan_item() returns trigger
language plpgsql set search_path = '' as $$
declare
  schedule_changed boolean;
  content_changed boolean;
begin
  if tg_op = 'INSERT' then
    -- extracted items always start as drafts that the user must inspect and confirm
    if new.provenance = 'extracted' and new.status <> 'draft' then
      raise exception 'extracted_items_start_as_draft' using errcode = '22023';
    end if;
    if new.status = 'confirmed' then
      new.confirmed_at := now();
    end if;
    new.version := 1;
    return new;
  end if;

  -- The owner may change only inside merge_whatsapp_account (transaction-local flag).
  if new.plan_id is distinct from old.plan_id
     or (new.user_id is distinct from old.user_id and coalesce(current_setting('sukhi.merging', true), '') <> 'on') then
    raise exception 'plan_item_owner_immutable' using errcode = '42501';
  end if;

  schedule_changed := (new.schedule_kind, new.times, new.weekdays, new.weekly_target, new.once_date, new.window_minutes)
                      is distinct from (old.schedule_kind, old.times, old.weekdays, old.weekly_target, old.once_date, old.window_minutes);
  content_changed := schedule_changed
                     or (new.title, new.instructions, new.category, new.evidence_hint, new.allowed_alternatives, new.unresolved_fields)
                        is distinct from (old.title, old.instructions, old.category, old.evidence_hint, old.allowed_alternatives, old.unresolved_fields);

  if old.status = 'confirmed' and new.status = 'confirmed' and content_changed then
    raise exception 'confirmed_item_change_requires_reconfirmation' using errcode = '22023';
  end if;

  if content_changed or new.status is distinct from old.status then
    new.version := old.version + 1;
  end if;
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    new.confirmed_at := now();
  elsif new.status <> 'confirmed' then
    new.confirmed_at := null;
  end if;
  return new;
end $$;

-- Move everything owned by an account that started on WhatsApp (p_src) into p_dst.
-- Every public column that references auth.users is moved, found from the catalog so new
-- tables are covered. A row that would collide (the same circle, the same doctor...) is
-- dropped from the source instead. Profile, consents and link codes stay with p_dst; the
-- caller deletes the p_src auth user afterwards.
create or replace function public.merge_whatsapp_account(p_src uuid, p_dst uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  moved int := 0;
  n int;
begin
  if p_src = p_dst then raise exception 'same_account' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_src and signup_channel = 'whatsapp') then
    raise exception 'source_not_whatsapp_account' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_dst) then
    raise exception 'target_missing' using errcode = 'P0002';
  end if;
  perform set_config('sukhi.merging', 'on', true);

  -- The WhatsApp binding moves to the web account (replacing any other number it had).
  update public.channel_bindings set status = 'revoked', opted_out_at = now()
   where user_id = p_dst and status <> 'revoked'
     and external_id not in (select external_id from public.channel_bindings where user_id = p_src and status <> 'revoked');
  update public.channel_bindings set status = 'revoked' where user_id = p_dst and status <> 'revoked'
     and external_id in (select external_id from public.channel_bindings where user_id = p_src and status <> 'revoked');
  update public.channel_bindings set user_id = p_dst where user_id = p_src;

  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
       and c.connamespace = 'public'::regnamespace
       and c.conrelid::regclass::text not in ('public.profiles', 'public.consents', 'public.link_codes', 'public.channel_bindings', 'public.wa_connect_requests')
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col) using p_dst, p_src;
      get diagnostics n = row_count;
      moved := moved + n;
    exception when unique_violation or check_violation then
      execute format('delete from %s where %I = $1', r.tbl, r.col) using p_src;
    end;
  end loop;

  -- Fill what the web profile doesn't have yet.
  update public.profiles d set
    display_name = coalesce(d.display_name, s.display_name),
    personal_motivation = coalesce(d.personal_motivation, s.personal_motivation),
    onboarded_at = coalesce(d.onboarded_at, s.onboarded_at),
    primary_role = case when s.primary_role = 'doctor' then 'doctor' else d.primary_role end
  from public.profiles s where d.id = p_dst and s.id = p_src;
  begin
    update public.profiles set points_total = (select coalesce(sum(greatest(points, 0)), 0) from public.reward_events where user_id = p_dst) where id = p_dst;
  exception when undefined_column then null;
  end;
  insert into public.consents (user_id, kind, granted, granted_at)
  values (p_dst, 'whatsapp', true, now())
  on conflict (user_id, kind) do update set granted = true, granted_at = now(), revoked_at = null;
  insert into public.audit_events (user_id, actor, action, entity, entity_id, details)
  values (p_dst, 'user', 'whatsapp_account_merged', 'profile', p_src::text, jsonb_build_object('rows_moved', moved));
  perform set_config('sukhi.merging', 'off', true);
  return jsonb_build_object('ok', true, 'rows_moved', moved);
end $$;
revoke all on function public.merge_whatsapp_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_whatsapp_account(uuid, uuid) to service_role;
