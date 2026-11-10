# Sukhi 60

Sukhi helps a person stay with a routine they have agreed on — with their care team (transcribed clinician instructions) or with themselves (personal wellbeing goals). It works in English, हिन्दी and मराठी, on the web/PWA and optionally on official WhatsApp.

**New operator? Follow [docs/OPERATOR_QUICKSTART.md](docs/OPERATOR_QUICKSTART.md)** — one ordered path from a clean checkout to a demo, then AI/voice, then a real WhatsApp test.

> Sukhi is not a medical device, does not diagnose, does not adjust treatment, and does not monitor emergencies. It is a production-oriented hackathon build, not a clinically validated service.

## The loop
Agreed plan → scheduled action → reminder/check-in → response or evidence → evaluation → progress/encouragement → barrier-aware follow-up.

| Pillar | Where |
|---|---|
| Supportive assistant | `src/server/agent.ts` (bounded tool loop), `src/domain/router.ts`, `src/domain/safety.ts`, `/chat` |
| Action evaluation | `src/domain/evaluation.ts`, `src/server/ai-tasks.ts`, SQL `apply_evaluation_internal`, `/actions/[id]` |
| Encouragement | SQL `_award` (rules + caps + dedupe), `src/domain/rewards.ts`, `src/components/Garden.tsx`, `/progress` |

## Architecture
```
Browser/PWA ──► Next.js 16 on Vercel (Node runtime)
                 ├─ pages: /today /chat /plan /progress /settings /onboarding /demo /family/*
                 ├─ /api/chat · /api/evidence · /api/plan/extract · /api/voice/*      (session-authenticated)
                 ├─ /api/whatsapp/webhook   (HMAC-verified; persist → enqueue → after())
                 └─ /api/worker/tick        (bearer secret; claims leased jobs)
Supabase ──► Postgres (RLS on every patient table, SQL state functions, jobs outbox)
         ├─ Auth (@supabase/ssr cookies) · private Storage buckets
         └─ Cron (pg_cron) + pg_net + Vault ──► POST /api/worker/tick every minute
Providers ──► Anthropic (AI SDK, model from env) · Sarvam ASR/TTS · Meta WhatsApp Cloud API
```
Identity always comes from the verified session or a verified WhatsApp binding, never from model output. The model can act only through tools bound to that identity. Completion state and rewards are changed only by SQL functions.

## Scripts
| Script | Purpose |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm db:start` / `db:reset` / `db:types` | Local Supabase, apply migrations, generate types |
| `pnpm check` | typecheck + lint + unit/integration tests + build |
| `pnpm test:unit` / `test:integration` / `test:e2e` | Vitest (pure) / Vitest against local Supabase / Playwright |
| `pnpm check:config [--strict]` | Shows set/missing/invalid per variable, never values |
| `pnpm worker:tick` | Manual authenticated worker run |
| `pnpm jobs:health` | Job states, dead letters, uncertain WhatsApp sends |
| `pnpm seed:demo` | Fictional local demo account |

## User journeys
1. **Start:** sign up → onboarding (name, language, timezone, check-in times, quiet hours, accessibility, optional context, explicit permissions) → pick an example personal routine or enter your doctor's instructions.
2. **Plan:** create a personal goal or a clinician-instruction plan. Add items manually, or upload a photo or PDF to get *drafts* with page/snippet provenance. Fill in unresolved fields, then confirm. Edits to confirmed items go back to draft and are versioned.
3. **Today:** each action shows its local time and status. Choose Done, Later, Skip (optional reason), or Not well. Silence becomes "No reply recorded" and is never counted as missed.
4. **Evidence:** add a photo or note. The assessment lists what is visible and what it cannot confirm, and you can request a review. A self-report and evidence-supported completion are shown differently.
5. **Assistant:** type or record a voice note (you confirm the transcript before it is sent). Replies cite your plan records. Concerning symptoms trigger a fixed safety message.
6. **Progress:** a garden that only grows, a weekly table, milestones, and an optional personal reward goal.
7. **WhatsApp (optional):** link with a one-time code sent from your WhatsApp. Reply "done", send photos or voice notes, or send STOP. The history is shared with the web app.
8. **Family (optional):** invite someone to see weekly participation counts only. Revoking access takes effect immediately.

## Documents
[SETUP.md](SETUP.md) · [WHATSAPP_SETUP.md](WHATSAPP_SETUP.md) · [USER_HANDOFF.md](USER_HANDOFF.md) · [ACCEPTANCE_REPORT.md](ACCEPTANCE_REPORT.md) · [BUILD_STATUS.md](BUILD_STATUS.md) · [REPO_ASSESSMENT.md](REPO_ASSESSMENT.md) · [LICENSE_NOTES.md](LICENSE_NOTES.md) · [.env.example](.env.example)
