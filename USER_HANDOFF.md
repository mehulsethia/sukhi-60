# User handoff

Updated 2026-11-10. **Deployed at https://sukhi-60.vercel.app (Vercel project `sukhi-60`, team mehul-sethias-projects) on Supabase project `sukhi-60` (ref `cjgrxdthigtidftwcjbg`, ap-southeast-2).** Migrations 0100–0400 applied remotely and verified (24 tables, RLS on all, both buckets private); scheduler job `sukhi-worker-tick` active. Pending: Vercel env vars `SUPABASE_SECRET_KEY` (current value rejected by Supabase), `WORKER_SECRET`, `LINK_CODE_PEPPER`, `NEXT_PUBLIC_APP_URL`, `DEMO_MODE_ENABLED`; Supabase Auth URL config. No AI/voice/WhatsApp provider live-tested.

## Configuration status matrix

Legend: **Code** = implemented in this repo · **Config** = credentials/settings in place · **Test** = fixture-tested (local stack, signed/mocked) / live-tested (real provider) / not tested.

| Dependency | Req? | Code | Config | Test | Exact remaining step | Depends on | Evidence |
|---|---|---|---|---|---|---|---|
| **Supabase project** (DB, Auth, Storage) | Required | Ready | **Missing**: no Sukhi project exists. Your account has DAILYCUE, Maidhive and Learn-Finnished, none of them for Sukhi | Fixture-tested on local Supabase (Postgres 17) | Decide the target (new project in which org, or an existing one), then `supabase link --project-ref <ref>` and `supabase db push` | Your decision | `supabase/migrations/*`, `tests/integration/*` |
| Migrations 0100–0400 | Required | Ready | Applied **locally only** (`supabase db reset`, all 4 versions) | Fixture-tested | `supabase db push` on the chosen project, then `supabase migration list` | Supabase target | SETUP.md §3 |
| Auth callbacks + email | Required | Ready (`/auth/callback`, password + magic link) | Missing remotely | Fixture-tested (local, confirmations off) | Set Site URL and redirect `https://<domain>/auth/callback`. Built-in email is development-only; **configure production SMTP** (separate provider of your choice) before real users | Domain | SETUP.md §3.3–3.4 |
| Private buckets | Required | Ready (migration 0400) | Local only | Fixture-tested (cross-user read/write/sign denied) | Applied by `db push`; confirm both buckets are private in Dashboard | Migrations | `tests/integration/rls.test.ts` |
| Scheduler (pg_cron + pg_net + Vault) | Required for reminders | Ready (`supabase/bootstrap/scheduler.sql`) | Missing remotely | **Live-tested locally**: pg_cron → pg_net → `/api/worker/tick` returned HTTP 200 and processed jobs | Run the bootstrap SQL in the remote SQL editor with `<APP_URL>`/`<WORKER_SECRET>` | Vercel URL + WORKER_SECRET | BUILD_STATUS.md, SETUP.md §3.6 |
| Worker secrets | Required | Ready | Local `.env.local` only | Fixture-tested (401 without bearer) | Generate new `WORKER_SECRET` and `LINK_CODE_PEPPER` for production; set them in Vercel and Vault | — | `src/server/http.ts` |
| **Vercel project** | Required | Ready (Next 16, Node runtime, root `sukhi-60`) | **Missing**: no `sukhi-60` project; nothing deployed (CLI is authenticated as `mehulsethia`) | Production build passes locally | Confirm creating project `sukhi-60` in `mehul-sethias-projects`, then `vercel link`, set env vars, `vercel deploy --prod` | Supabase project | SETUP.md §5 |
| Public URL / webhook reachability | Required for WhatsApp | Ready | Missing | Not tested remotely | After deploy: `curl /api/health`, GET webhook verify with token | Vercel deploy | WHATSAPP_SETUP.md §4 |
| **Anthropic API** | Optional (AI features) | Ready (AI SDK + @ai-sdk/anthropic, model from `ANTHROPIC_MODEL`) | **Missing** key and model | Fixture-tested with a mock model; **not live-tested** | Create an API key at console.anthropic.com (separate billing; **not** included with Claude Code or Claude.ai plans). Set `ANTHROPIC_MODEL` to a current tool- and vision-capable model (e.g. `claude-opus-5-5`). Check rate limits/credits, then run a live text + image smoke test | Vercel deploy | `src/server/agent.ts`, `tests/integration/agent.test.ts` |
| **Sarvam speech** | Optional | Ready (ASR `saaras:v4`, TTS `bulbul:v3`/`shubh`, configurable) | **Missing** key | **Not live-tested**; UI fallback tested (mic denied → typing) | Add `SARVAM_API_KEY`, then smoke-test en/hi/mr voice notes from Chrome (webm/opus) and Safari (mp4), plus playback | Vercel deploy, voice consent | `src/server/providers.ts`, `tests/e2e/mobile.spec.ts` |
| **Meta WhatsApp** (app, WABA, number, token, app secret, verify token, webhook, templates, approval) | Optional | Ready | **Missing**: none of these exist | Fixture-tested (signed webhooks, local Graph mock); **no real Meta message** | Follow WHATSAPP_SETUP.md §1–8. Template approval and business verification are decided by Meta (no promised date) | Vercel URL | WHATSAPP_SETUP.md, `tests/integration/whatsapp.test.ts` |
| Opt-in / linking | Required for WhatsApp | Ready (one-time code from the account; STOP/START) | — | Fixture-tested | Real-device test with opted-in testers | Meta setup | `tests/integration/jobs-linking-family.test.ts` |
| Custom domain / DNS | Optional | n/a | Not configured | — | Add a domain in Vercel, update Supabase Site URL/redirects, Meta callback, and `NEXT_PUBLIC_APP_URL` | Vercel | — |
| Monitoring / notifications | Optional | Redacted `agent_runs`/`audit_events`, `pnpm jobs:health` | No external vendor enabled | — | Optionally add Vercel log drains or an alert on `jobs:health` output. No paid vendor was enabled | — | `scripts/job-health.mts` |
| GitHub CI | Optional | Workflow file added (`.github/workflows/ci.yml`) | Repo is local git only (not on GitHub) | — | Create a GitHub repo and push to enable CI | Your decision | — |

## Human actions in dependency order
1. **Decide the Supabase target** (see the question at the end of the final report). Then `supabase link` and `supabase db push`.
2. **Approve creating the Vercel project `sukhi-60`**, or name an existing one. Set env vars (SETUP.md §5) and deploy.
3. Configure Supabase Auth URLs and a production SMTP provider.
4. Run `supabase/bootstrap/scheduler.sql` with the production URL and secret. Confirm 200 responses.
5. Create the Anthropic API key and choose the model. Create the Sarvam key. Redeploy and run the Stage C smoke tests (docs/OPERATOR_QUICKSTART.md).
6. Complete the Meta setup (WHATSAPP_SETUP.md), submit templates, and run real opt-in tests.
7. Product acceptance (below).

## Product acceptance before any patient pilot
- **This is a hackathon-grade, production-oriented prototype, not a clinically validated service.** It makes no diagnostic or adherence-verification claims.
- Have a clinician review: the escalation wording and trigger phrases (`src/domain/safety.ts`), the clinical-referral behaviour, how clinician-provided items are represented, and the "clinician-verified" workflow. No clinician approval UI exists yet. The flag can only be set by a service-role process.
- Verify document extraction against real (de-identified) instruction sheets. Every extracted item must be checked against its source before confirmation.
- Evaluate assistant replies and voice transcription with real intended speakers of English, Hindi and Marathi, including code-switching. **Have native speakers review `messages/hi.json`, `messages/mr.json` and `src/domain/replies.ts`.**
- Complete privacy and legal review (data processing by Anthropic, Sarvam, Meta; retention; India DPDP Act obligations) and choose the app's own licence.
