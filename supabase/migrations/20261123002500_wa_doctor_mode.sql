-- One WhatsApp number can be both doctor and patient. Messages go to the person's default
-- side (profiles.primary_role); typing "clinic" opens the doctor side until this time,
-- extended by each doctor-side message.
alter table public.channel_bindings add column if not exists wa_doctor_until timestamptz;
