-- Doctor's "proof needed": a linked doctor can ask for a photo on specific plan items.
-- On those items a plain Done no longer counts; the patient is asked for a photo instead.
-- Patients can't change these columns: the authenticated role only has column-level update
-- grants on the editable fields (see 20261110000200), so only the server sets them.
alter table public.plan_items
  add column if not exists proof_required boolean not null default false,
  add column if not exists proof_required_by uuid references public.profiles(id) on delete set null,
  add column if not exists proof_required_at timestamptz;
