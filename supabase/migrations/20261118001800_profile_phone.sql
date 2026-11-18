-- Phone number on every account, so a WhatsApp message can be matched to the web account.
-- A typed number is only a claim: it becomes verified when that WhatsApp number confirms
-- (or is already linked). Only verified numbers must be unique, so nobody can block another
-- person's number by typing it first.
alter table public.profiles
  add column if not exists phone text check (phone ~ '^[0-9]{10,15}$'),
  add column if not exists phone_verified_at timestamptz;
create unique index if not exists profiles_phone_verified on public.profiles (phone) where phone_verified_at is not null;
create index if not exists profiles_phone on public.profiles (phone);

-- Numbers already linked on WhatsApp are verified.
update public.profiles p set phone = b.external_id, phone_verified_at = coalesce(b.opted_in_at, now())
  from public.channel_bindings b
 where b.user_id = p.id and b.channel = 'whatsapp' and b.status <> 'revoked' and p.phone is null
   and b.external_id ~ '^[0-9]{10,15}$';

-- The merge function: the web profile keeps its phone, or takes the WhatsApp one.
create or replace function public.merge_phone_after_link(p_user uuid, p_phone text) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set phone = null, phone_verified_at = null where phone = p_phone and phone_verified_at is not null and id <> p_user;
  update public.profiles set phone = p_phone, phone_verified_at = now() where id = p_user;
$$;
revoke all on function public.merge_phone_after_link(uuid, text) from public, anon, authenticated;
grant execute on function public.merge_phone_after_link(uuid, text) to service_role;
