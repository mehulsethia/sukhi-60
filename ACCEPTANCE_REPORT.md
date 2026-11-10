# Acceptance report

Run date: 2026-11-10, against the local Supabase stack (Docker, Postgres 17) and a local production build. **Fixture-tested** means verified locally with real local identities and signed or mocked provider traffic. **Live-tested** means verified against a real external provider. **Nothing below is live-tested with Anthropic, Sarvam or Meta, and nothing has been deployed.**

## Commands and results (latest run)
| Command | Result |
|---|---|
| `pnpm typecheck` | pass (0 errors) |
| `pnpm lint` | pass (0 errors, 0 warnings) |
| `pnpm test:unit` | 50 / 50 pass |
| `pnpm test:integration` | 51 / 51 pass (stable across 3 consecutive runs) |
| `pnpm build` | pass (Next 16.4.6, Turbopack) |
| `pnpm exec playwright test` | 4 / 4 pass (desktop journey ×3, mobile ×1) |
| Local scheduler check | pg_cron → pg_net → `/api/worker/tick` returned **HTTP 200**, 2 jobs claimed/done |
| Secret scan of `.next/static` | no secret values or secret variable names in client bundles |

## Requirement → implementation → evidence

| Requirement | Implementation | Test evidence | Status |
|---|---|---|---|
| **A. Auth + onboarding** (server sessions, prefs, consents, initial routine, WhatsApp optional) | `src/proxy.ts`, `src/lib/supabase/server.ts` (`getUser` verifies JWT), `src/app/onboarding/*`, `src/server/consents.ts` | E2E sign-up → onboarding; unauthenticated redirect + 401 APIs; RLS consent test | Fixture-tested |
| **B. Plan modes** (clinician transcription vs personal goal; user can't self-verify) | `care_plans.mode`, `clinician_verification` + `guard_care_plan` trigger | `rls.test.ts` "cannot self-assert clinician verification" | Fixture-tested |
| B. Upload → DRAFT with page/snippet; unclear stays unresolved; confirm before scheduling | `src/domain/extraction.ts`, `src/server/ai-tasks.ts#extractPlanDraft`, `addExtractedDrafts`, DB check `confirmed ⇒ unresolved_fields = {}`, `extracted_items_start_as_draft` | `evaluation-extraction.test.ts` (never guesses dose/time; invalid times unresolved) | Fixture-tested (no live model run) |
| B. Versioning + history; confirmed items can't be silently rescheduled | `guard_plan_item`, `record_plan_item_version`, `plan_item_versions` | `rls.test.ts` versioning test (created → edited → edited → confirmed) | Fixture-tested |
| B. Manual entry without provider | `ItemForm` + `saveItem` | E2E creates and confirms an item with AI unconfigured | Fixture-tested |
| **C. Today**: daily, weekday, weekly targets; 12 statuses; silence ≠ miss; UTC + tz | `src/domain/schedule.ts`, `occurrence_status` enum, `apply_silence_rule`, `displayStatus` | `schedule.test.ts` (IST, DST, weekdays, weekly, quiet hours), `lifecycle.test.ts` (silence → `no_response`) | Fixture-tested |
| **D. Assistant**: text + push-to-record, transcript confirmation, en/hi/mr, provider adapters, text fallback | `ChatClient`, `VoiceRecorder` (codec detection, stop/cancel, 60 s cap), `providers.ts` (Sarvam), `/api/voice/*` | E2E mobile: mic denied → typing still works; agent fallback tests | UI fixture-tested; **speech not live-tested** |
| D. Replies from the user's plan/history | `agent.ts` context + tools; grounded `sources` | `agent.test.ts` (sources limited to retrieved ids) | Fixture-tested with mock model |
| **E. Evidence & evaluation**: per occurrence; observable-only; uncertainty; review | `evidence` table (unique per occurrence+hash), `constrainEvaluation`, `apply_evaluation_internal`, `ReviewForm` | Unit: food ≠ eaten, pills ≠ swallowed, park ≠ duration; integration: text = self-report, unconfigured never "supports", duplicate blocked, status mapping | Fixture-tested (no live vision call) |
| E. Self-report vs evidence-supported distinct | statuses `self_reported` vs `evidence_supported`; UI labels | E2E shows "Done (your report)" after photo with AI off | Fixture-tested |
| **F. Progress & encouragement**: garden, weekly view, milestones, optional reward goal; exact rules; once per event; no extra for extra doses; returns rewarded | SQL `_award` / `apply_check_in_internal` (dedupe keys, daily cap 12), `rewards.ts`, `Garden.tsx`, `/progress` | `lifecycle.test.ts`: rewards once, concurrent duplicates once, cap ≤ 12, return bonus, extra dose = nothing; unit garden never shrinks | Fixture-tested |
| **G. Family**: invite + consent, summary only, immediate revocation, preview/export | `family_access`, `accept_family_invite`, `family_summary` (checked per call), Settings preview + JSON export | `jobs-linking-family.test.ts`: member sees counts only, no raw tables; revoke → next call denied; can't restore | Fixture-tested. **No automatic family messaging** (by design) |
| **§5 Agent**: authenticated tools, identity from session/binding, schema validation, confirmations, budgets/timeouts, run logs, no CoT stored | `agent.ts` (14 tools closed over userId, Zod schemas, ≤5 steps, 25 s timeout, ≤3 mutations, ≤10 tool calls, `user_quote` grounding, `CONFIRM <code>`), `agent_runs` | `agent.test.ts`: ungrounded tool call can't complete; other user's occurrence id rejected; model can't confirm; clinical retiming refused + review; injection flagged; provider failure = honest error | Fixture-tested with `MockLanguageModelV4` |
| §5 Safety: escalation, no dosing advice, untrusted content quoted | `safety.ts` (en/hi/mr patterns, prewritten messages), `router.ts` | Unit + `agent.test.ts` (chest pain → escalation, no "you're fine"; dose question → referral) | Fixture-tested; **needs clinical review** |
| §5 Persistent memory across web + WhatsApp | `messages`, `memory_facts` (proposed/confirmed/superseded), shared `runAssistant` | `whatsapp.test.ts` + E2E: WhatsApp messages appear in web chat; same check-in state | Fixture-tested |
| **§6 Data model & security**: RLS on every patient table, column grants, private buckets, service key server-only, scoped definer RPCs, atomic rewards | migrations 0100–0400 | `rls.test.ts` (two+ real identities: cross-user reads/writes/RPC/storage denied; anon reads nothing; direct state writes denied) | Fixture-tested |
| **§7 Durable scheduling**: outbox jobs, leases, recovery, backoff, dead letter, idempotency, plan-change protection, uncertain sends | `jobs` + `claim_jobs`/`claim_job`/`fail_job`, `worker.ts`, `scheduler.sql` | `jobs-linking-family.test.ts` (no double claim by 3 concurrent workers, lease recovery, backoff → dead, version change cancels); `whatsapp.test.ts` (uncertain never resent; 500 → backoff); live local cron | Fixture-tested + live local scheduler |
| **§8 WhatsApp**: GET verify, raw-body HMAC, dedupe, statuses, media limits, linking, STOP, 24h window, templates | `webhook/route.ts`, `domain/whatsapp.ts`, `consume_link_code`, `worker.ts` | Unit signature/parse/decideSend/trusted hosts; integration verify/401/link/replay/window/template/STOP/status; E2E with local Graph mock | Fixture-tested; **no real Meta traffic** |
| **§9 PWA/UI/a11y**: mobile-first views, states, labels, en/hi/mr dictionaries, manifest/icons, SW caches public assets only | `globals.css` tokens + dark mode, `BottomNav`, `messages/*.json`, `public/sw.js`, `manifest.ts`, `icons/[size]` | i18n key/placeholder parity test; E2E mobile layout (no horizontal overflow, bottom nav pinned) | Fixture-tested. Not audited with a screen reader |
| Fictional demo route, no DB writes | `/demo` (`DemoClient`, banner) | E2E checks banner | Fixture-tested |

## Not implemented / external blockers
- **Deployment:** blocked on choosing the Supabase target and confirming the Vercel project (see USER_HANDOFF.md).
- **Live provider tests (Anthropic, Sarvam, Meta):** blocked on credentials and, for Meta, account setup and approvals.
- **Web Push notifications:** not implemented. Without WhatsApp, reminders still fire durably (status moves to "awaiting reply" and an in-app notice is written), but the user only sees them when they open the app.
- **Clinician approval workflow UI:** not implemented. `clinician_verified` can only be set by a service-role process, and users can never self-assert it.
- **Derived memory summaries / embeddings:** not implemented (optional in brief). Memory is structured facts plus bounded recent history.
- **Offline queueing:** not supported. Mutations need connectivity, and offline attempts show an explicit "not saved" message (chat, evidence).
- **Native-speaker review** of Hindi/Marathi copy and safety phrases: pending.
