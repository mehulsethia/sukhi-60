# Build status

Updated 2026-11-10.

## Done
- [x] Repo assessment + licence decision (no copied code) → REPO_ASSESSMENT.md, LICENSE_NOTES.md
- [x] Next.js 16 app in `sukhi-60/` (App Router, Node runtime, Tailwind 4, next-intl en/hi/mr, PWA)
- [x] Supabase migrations 0100 schema · 0200 RLS/guards · 0300 state functions · 0400 private storage (applied **locally**)
- [x] Scheduler bootstrap SQL (pg_cron + pg_net + Vault) — live-verified against local stack (HTTP 200)
- [x] Plan modes, drafts/extraction, versioning, confirmation gates
- [x] Occurrences, check-ins, silence rule, rewards (SQL, atomic, deduped), garden/progress
- [x] Evidence + constrained evaluation + review requests
- [x] Bounded agent with 14 authorized tools, router, safety screens, persistent context
- [x] WhatsApp Cloud API: webhook verify/HMAC, outbox, linking codes, STOP, window/templates
- [x] Family consent + summary + immediate revocation + preview/export
- [x] Scripts: check:config, jobs:health, worker:tick, seed:demo; CI workflow file
- [x] Tests: 50 unit, 51 integration, 4 Playwright (all passing)
- [x] Docs: README, SETUP, WHATSAPP_SETUP, USER_HANDOFF, ACCEPTANCE_REPORT, OPERATOR_QUICKSTART

## Remaining (blocked on owner)
- [ ] Choose the Supabase target → `supabase link` + `db push`
- [ ] Confirm Vercel project `sukhi-60` → env vars + deploy + scheduler bootstrap
- [ ] Anthropic / Sarvam keys → live smoke tests
- [ ] Meta WhatsApp setup + template approval → real opt-in tests
- [ ] Native-speaker + clinical review

## Decisions
- One Next.js app on Vercel + Supabase only; no Redis, vector DB, Python service or agent framework.
- Scheduler = Supabase Cron → pg_net → secured Vercel Node handler (`/api/worker/tick`), so heavy deps (AI SDK, Supabase JS) stay out of Edge Functions. No Vercel Cron dependency.
- Webhooks persist + enqueue, then process via `after()` for low latency; cron worker is the durable fallback.
- Reward rules live in SQL for atomicity; TS only derives display.
- Silence → `no_response` (never "missed"); explicit miss is user-reported.
- Photos can at most *partially* support medication/food/activity actions (deterministic ceiling).
- shadcn/ui and React Hook Form not adopted: small local accessible primitives + server actions with Zod keep bundles small and forms progressive. Serwist not adopted: a 40-line audited service worker caches only public static assets.
- Uploads capped at 4 MB (Vercel body limit) with client-side photo downscaling.

## Remaining risks
1. Safety phrase lists are heuristic; false negatives are possible → clinical review needed; UI never claims monitoring.
2. Hindi/Marathi copy written without native review.
3. Live model behaviour (tool choice, extraction fidelity on handwriting) untested; controls are tested with mocks.
4. Meta may restrict AI-assisted messaging for this use case; approval not guaranteed.
5. Reminder latency depends on Supabase Cron + pg_net; no web push fallback.
6. Built-in Supabase email is not suitable for production.
