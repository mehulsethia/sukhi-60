-- Assistant proposals can now pause, resume or remove a task, or archive a whole goal,
-- not only retime a task. A goal proposal points at the plan instead of an item.
-- All proposals made in one assistant reply share one confirm_code, so one tap applies them.
alter table public.change_proposals
  alter column item_id drop not null,
  alter column item_version drop not null,
  add column plan_id uuid references public.care_plans (id) on delete cascade;

alter table public.change_proposals
  add constraint change_proposals_target check (item_id is not null or plan_id is not null);

create index change_proposals_code on public.change_proposals (user_id, confirm_code);
