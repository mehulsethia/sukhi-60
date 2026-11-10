# Operator quickstart

One path, in dependency order. Every stage works without the stages after it. Run commands from `SUKHI-60/sukhi-60/`.

## Stage A — fictional demo on your machine (no accounts needed)
1. Install Node ≥ 22, pnpm 10, Docker Desktop (running), and the Supabase CLI.
2. Install and start the local database:
   ```bash
   pnpm install
   pnpm db:start
   pnpm db:reset
   ```
3. Create `.env.local`:
   ```bash
   cp .env.example .env.local
   supabase status -o env     # copy API_URL -> NEXT_PUBLIC_SUPABASE_URL, PUBLISHABLE_KEY, SECRET_KEY -> SUPABASE_SECRET_KEY
   openssl rand -hex 32       # -> WORKER_SECRET
   openssl rand -hex 32       # -> LINK_CODE_PEPPER
   pnpm check:config          # all REQUIRED rows must say "set"
   ```
4. Run it: `pnpm dev`, then open http://localhost:3000.
   - `/demo` is the clearly-marked fictional demo (nothing saved).
   - Or create a real local account, or run `pnpm seed:demo` and sign in as `demo@sukhi.example` / `sukhi-demo-password`.
5. Simulate the scheduler: `pnpm worker:tick` sends due reminders (in-app), applies the silence rule, and processes jobs.
6. Verify: `pnpm check` (typecheck, lint, unit + integration tests, build) and `pnpm test:e2e`.

**Ready when:** sign-up → onboarding → create and confirm a plan item → Today shows it → Done/Skip/evidence work → Progress garden grows → `pnpm jobs:health` shows no dead jobs.

## Stage B — real Supabase + Vercel (needs: target project decision)
1. Supabase: `supabase link --project-ref <ref>`, then `supabase db push` and `supabase migration list` (all four versions should be applied).
2. Supabase Auth: Site URL and redirect `https://<domain>/auth/callback`. Configure custom SMTP before inviting real users.
3. Vercel: set the project root to `sukhi-60` (or the repo root if this folder is its own repo) and Node 24.x. Add all required env vars, then `vercel deploy --prod`.
4. Scheduler: run `supabase/bootstrap/scheduler.sql` in the SQL editor with `<APP_URL>` and `<WORKER_SECRET>` replaced. Confirm `net._http_response` shows 200 every minute.
5. Verify: `/api/health` returns 200, `/api/worker/tick` without bearer returns 401, sign-in works, Today loads.

**Ready when:** a reminder created in production shows up on Today within about 1–2 minutes with no browser open, and `pnpm jobs:health` (with production env) is clean.

## Stage C — AI and voice (needs: Anthropic + Sarvam API keys)
1. Set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (current tool- and vision-capable model ID from Anthropic's docs) in Vercel, then redeploy.
2. Set `SARVAM_API_KEY` (optionally `SARVAM_ASR_MODEL`, `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER`), then redeploy.
3. Live smoke tests, using a test account only:
   - Assistant: "what's on my plan today?" (the answer cites plan items) and "I walked 20 minutes" (records a check-in, with a "Recorded:" footer).
   - Upload a photo on an action. The assessment lists observed items and what can't be confirmed.
   - Upload a printed sample instruction sheet on a plan. Drafts appear with page/snippet, unclear fields stay unresolved, and nothing is scheduled until you confirm.
   - Record voice notes in English, Hindi and Marathi. The transcript is shown for confirmation. Play a reply aloud.

**Ready when:** Settings → Service status shows AI and Voice as *Available*, and `agent_runs` rows show `outcome = ok`.

## Stage D — real opt-in WhatsApp test (needs: Meta app/WABA/number, Stage B deployed)
Follow [WHATSAPP_SETUP.md](../WHATSAPP_SETUP.md) sections 1–8:
1. Set the four `WHATSAPP_*` secrets and IDs, then redeploy.
2. Set the webhook to `https://<domain>/api/whatsapp/webhook` with the verify token, subscribe to `messages`, and click Verify and save.
3. Add yourself as a test recipient, then link with Settings → WhatsApp → Create link code and send `SUKHI-XXXXXXXX`.
4. Send text, a photo and a voice note. Then send `STOP` and `START`.
5. After template approval, set `WHATSAPP_APPROVED_TEMPLATES` and test an out-of-window reminder.

## Readiness checklist
- [ ] `pnpm check:config --strict` passes in each environment
- [ ] `supabase migration list` shows 20261110000100, 0200, 0300 (incl. claim_job), 0400 applied remotely
- [ ] Both storage buckets are private
- [ ] Scheduler job active; `net._http_response` returns 200
- [ ] Auth redirect URLs and production SMTP configured
- [ ] `/api/worker/tick` returns 401 without the bearer
- [ ] AI and voice smoke tests passed with test accounts
- [ ] WhatsApp verified, template approved, and real text/image/audio/STOP tested with opted-in testers
- [ ] Hindi and Marathi copy reviewed by native speakers
- [ ] Clinical review done before any patient pilot (see USER_HANDOFF.md)
