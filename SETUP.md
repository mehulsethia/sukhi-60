# Setup

Commands run from `sukhi-60/` unless stated otherwise. For a single ordered path, see [docs/OPERATOR_QUICKSTART.md](docs/OPERATOR_QUICKSTART.md).

## 1. Prerequisites
- Node.js ≥ 22 (built and tested on 26.x; deploy on Vercel's Node 24.x), pnpm 10, Docker (for local Supabase), Supabase CLI ≥ 2.98, Vercel CLI (optional).

## 2. Local development
```bash
pnpm install
pnpm db:start                 # local Supabase (Postgres, Auth, Storage, Mailpit) via Docker
pnpm db:reset                 # applies supabase/migrations/* in order
supabase status -o env        # copy API_URL / PUBLISHABLE_KEY / SECRET_KEY into .env.local
cp .env.example .env.local    # then fill the Supabase values + WORKER_SECRET + LINK_CODE_PEPPER
pnpm check:config             # set / missing / invalid only — never prints values
pnpm dev                      # http://localhost:3000
pnpm seed:demo                # optional fictional account demo@sukhi.example (local only)
pnpm worker:tick              # manual authenticated worker run (reminders, inbound, evaluation)
pnpm jobs:health              # job states, dead letters, uncertain sends
```
Env files: `.env.local` = the real (production) Supabase project used by `pnpm dev` and scripts; `.env.test.local` = the LOCAL Docker stack used only by `pnpm test` and `pnpm test:e2e` (the test setup refuses any non-local URL). Both are git-ignored.

Locally, email confirmation is off (`supabase/config.toml`) and magic-link emails go to Mailpit (http://127.0.0.1:54324).

## 3. Supabase project (remote)
1. Create (or choose) the project. Note its **project ref**.
2. Link and push migrations. This is additive and never resets data:
   ```bash
   supabase link --project-ref <ref>
   supabase db push              # applies 20261110000100..400 in order; prints each version
   supabase migration list       # confirm Local == Remote for every version
   ```
3. **Auth → URL configuration:** Site URL = `https://<your-domain>`. Additional redirect URLs: `https://<your-domain>/auth/callback` (add preview domains as needed).
4. **Auth → Email:** the built-in email sender is rate-limited and meant for development. For real users, configure custom SMTP (Auth → SMTP settings) with a provider you choose. This is a separate dependency.
5. **Storage:** the `plan-sources` and `evidence` buckets are created **private** by migration `…0400`. Verify in Dashboard → Storage that neither bucket is public.
6. **Scheduler (elevated, once):** open SQL Editor, paste `supabase/bootstrap/scheduler.sql`, replace `<APP_URL>` and `<WORKER_SECRET>` **in the editor only**, then run it. Check:
   ```sql
   select jobname, schedule, active from cron.job;
   select status, start_time from cron.job_run_details order by start_time desc limit 5;
   select status_code, created from net._http_response order by created desc limit 5;  -- expect 200
   ```
7. Regenerate types if the schema changes: `supabase gen types typescript --project-id <ref> > src/lib/database.types.ts`.

## 4. AI (Anthropic) and voice (Sarvam)
- `ANTHROPIC_API_KEY` comes from console.anthropic.com. It is billed separately and is **not** covered by Claude.ai or Claude Code plans. `ANTHROPIC_MODEL` must be a current model ID with tool use and vision, taken from Anthropic's models page (e.g. `claude-opus-5-5` as of Nov 2026). Without them, the assistant falls back to deterministic quick replies and evidence is stored without an automatic description.
- **Voice (ElevenLabs, preferred):** set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` (optionally `ELEVENLABS_VOICE_ID_HI` / `_MR`). Transcription uses `scribe_v2` (auto-detects en/hi/mr and code-mixing); replies use `eleven_v4` (supports Hindi and Marathi). Without a voice ID, transcription still works and audio playback is hidden.
- **Voice (Sarvam, alternative):** `SARVAM_API_KEY` comes from dashboard.sarvam.ai; used only when no ElevenLabs key is set. Defaults are `saaras:v4` (ASR; webm/ogg/opus/mp4 accepted; REST is meant for clips under 30 s, which is why the app limits recordings to 60 s) and `bulbul:v3` with speaker `shubh` (TTS; en-IN/hi-IN/mr-IN; WAV output). Without it, voice controls are hidden and text works fully.
- Smoke test after setting keys: sign in, open Assistant, ask "what is on my plan today?", record a short Hindi voice note, upload a photo on an action, then check Settings → Service status.

## 5. Vercel
1. Use **sukhi-60 as the project root**. If the Git repository is the whole `SUKHI-60` workspace, set *Root Directory* = `sukhi-60`. If `sukhi-60` is its own repository (it currently has its own local git), the root is the repository root.
2. Framework: Next.js. Node.js: 24.x. Build: `pnpm build`. Install: `pnpm install`.
3. Environment variables: add every variable from `.env.example` for **Production** (and **Preview** if you use previews, ideally pointing at a separate Supabase project). Mark secrets as *Sensitive*.
   ```bash
   vercel link            # choose/create the project "sukhi-60"
   vercel env add SUPABASE_SECRET_KEY production   # repeat per variable; values are prompted, not echoed
   vercel deploy --prod
   ```
4. After the deploy:
   - `curl https://<domain>/api/health` should return `{"ok":true,...}` (it deliberately exposes no config).
   - `curl -X POST https://<domain>/api/worker/tick` should return **401**, and with `-H "Authorization: Bearer $WORKER_SECRET"` it should return 200.
   - Sign up → onboarding → Today works; the auth email link returns to `/auth/callback`.
   - Run the scheduler bootstrap (step 3.6) with the production URL.
5. Do **not** use Vercel Cron for the worker. The 1-minute cadence comes from Supabase Cron (pg_cron + pg_net), which runs every minute regardless of the Vercel plan.

## 6. Upload limits
Vercel Functions reject request bodies over about 4.5 MB, so route uploads are capped at 4 MB and photos are downscaled in the browser (max 1600 px JPEG). WhatsApp media is fetched server-side from Meta (images ≤ 5 MB, PDFs ≤ 10 MB) and does not pass through a request body.

## 7. Checks
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # or: pnpm check
pnpm test:e2e                                            # builds, runs Playwright (desktop + mobile) against local Supabase
```
