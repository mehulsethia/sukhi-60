# Creative Intelligence & Adaptive Behaviour Engine: implementation plan

This plan implements `SUKHI_CREATIVE_INTELLIGENCE_IMPLEMENTATION.md` (ABCIE) inside the
existing Sukhi app. It builds on what the app already has and adds no parallel systems.

## 1. What already exists (reused)

| Spec capability | Existing implementation | Reuse decision |
|---|---|---|
| 8-step onboarding | `src/app/onboarding/OnboardingForm.tsx` (8 `<section>`s: language, tour, name/tz, check-in times + quiet hours, plan intake, comfort, permissions, first routine) | Keep 8 steps. Add fields to steps 5, 6 and 8 only |
| Profile / preferences | `profiles` table, `saveProfile`/`completeOnboarding` in `src/app/actions.ts`, Settings `PreferencesForm` | Add nullable columns. Use a separate save path so the existing settings form can't wipe them |
| Preferred check-in times | `profiles.checkin_times` | Reuse as-is |
| Habit events: scheduled | `action_occurrences` (one row per scheduled opportunity) | Reuse |
| Habit events: completed / skipped / missed / later / unable | `check_ins` (append-only, `unique(user_id, idempotency_key)`), via `apply_check_in_internal` | Reuse. No new event table for these |
| Unknown / no response | `apply_silence_rule` → `no_response`, never `missed` | Reuse. The restart flow never converts silence into a miss |
| Quiet hours, reminder frequency (normal/gentle/off), reminders consent | `profiles`, `consents`, `inQuietHours`, `runCheckins` filters | Reuse as the contact gate |
| Safety screens | `src/domain/safety.ts` (`detectConcern`, `ESCALATION_MESSAGE`, clinical-request refusal) | Reuse in the decision engine |
| Confirmation-gated plan changes | `guard_plan_item` trigger (a confirmed item can't change silently), the `saveItem` draft→edit→confirm pattern, the agent's rule that clinician items can't be retimed | Reuse the same pattern when a user accepts a time suggestion |
| Proactive messages | `src/server/checkins.ts` (`runCheckins`, idempotent via `provider_message_id`) | Add one restart follow-up message here, at the first check-in slot of the day |
| Restart reward | `_completion_followups` "Welcome back" (+3, never subtracts) | Reuse. Progress is never reset |
| LLM provider | `src/server/providers.ts#getModel` (Anthropic via AI SDK), consent `ai_processing` | Optional paraphrase, behind an env flag and consent |
| Localisation | `next-intl`, `messages/{en,hi,mr}.json`, direct JSON use in the worker (`checkins.ts`) | New `support.*` namespace |
| Admin / analytics | `/admin` page, `admin_metrics` RPC, CSV export | Add an `admin_behaviour_metrics` RPC, a section on the page and a CSV type |
| Deletion | FK `on delete cascade` from `auth.users`, account deletion action | New tables cascade too |

## 2. What's missing (built here)

Communication-style and restart-preference questions, personal motivation and habit
confidence, barrier capture, nudge logging, support suggestions with explicit accept or
decline, a deterministic decision policy, styled templates with anti-repetition, an
optional constrained LLM paraphrase, learning signals with a reset, pilot metrics,
existing-user prompt, and tests.

## 3. File-by-file

### Phase 2: profile and onboarding
- `supabase/migrations/20261113000800_behaviour_engine.sql` (new): profile columns
  `communication_styles text[]` (0–2, enum-checked), `restart_preference`,
  `personal_motivation` (≤280), `behaviour_schema_version`, `behaviour_prefs_updated_at`,
  `learning_reset_at`. Tables `habit_confidence`, `barrier_reports`, `nudge_events`,
  `support_suggestions` with RLS (read own; system writes only via service role, except
  `habit_confidence` insert-own). Also the `admin_behaviour_metrics` RPC.
- `src/lib/database.types.ts`: regenerate.
- `src/domain/behaviour.ts` (new): types, normalisers/defaults, barrier→strategy map,
  `chooseSupport`, `BEHAVIOUR_POLICY` (all pilot thresholds in one place).
- `src/app/onboarding/OnboardingForm.tsx`: step 5 adds optional motivation; step 6 adds
  questions A and B; step 8 adds optional confidence 1–10. Still 8 steps.
- `src/app/actions.ts`: `completeOnboarding` saves behaviour fields and confidence. New
  actions `saveSupportPreferences`, `resetLearnedSignals`, `reportBarrierAction`,
  `decideSuggestionAction`. `checkIn` accepts an optional barrier on skip.
- `src/components/SupportPrefsForm.tsx` (new) and the Settings "Support style" section.
- `src/app/(app)/today/page.tsx`: a dismissible, non-blocking prompt for existing users.
- `messages/{en,hi,mr}.json`: `support.*`, `onb.*` additions.

### Phase 3: event tracking
- `src/server/support.ts` (new): `reportBarrier` (idempotent, never changes occurrence
  status), `recordNudge`, `decideSuggestion`, `getBehaviourProfile`.
- `src/components/SupportFlow.tsx` (new): barrier chips → support message → confirm/decline.
  Used in `ActionCard` (after Skip) and `ChatClient` (restart follow-ups).

### Phase 4: decision and restart
- `src/domain/behaviour.ts`: `chooseSupport`, `strategyForBarrier` with clinical guard
  (medication or clinician plan → no change offers; physical discomfort → `safety_first`).
- `src/server/checkins.ts`: `runRestartFollowups` hook at the first slot of the day.
- Accepting a time change: draft → update → re-confirm through the user's RLS client,
  personal non-medication items only, version-checked, expiring.

### Phase 5: creative messaging
- `src/domain/nudges.ts` (new): template rendering, variant/style rotation
  (anti-repetition), `validateWording`, `paraphraseOrTemplate` (injectable generator;
  falls back on any failure).
- `src/lib/config.ts`: `SUPPORT_LLM_WORDING` (optional, default off).

### Phase 6: learning and reporting
- `src/domain/learning.ts` (new): descriptive signals, timing observation (repeated
  signals only), metric dictionary.
- `src/server/admin.ts`, `src/app/admin/page.tsx`, `src/app/admin/export/route.ts`: the
  behaviour metrics section and CSV.
- Settings shows what Sukhi has noticed, plus a reset button (explicit prefs kept).

### Tests
- `tests/unit/behaviour.test.ts`: policy, defaults, validation, anti-repetition, learning, metrics, onboarding step count.
- `tests/integration/behaviour.test.ts`: RLS isolation, idempotent barrier ingestion, confirmation-gated time change, clinician guard, follow-up limits (give_space, cap), unknown stays unknown, admin metrics.

### Docs
- `OPEN_QUESTIONS.md` (new) and `docs/CREATIVE_INTELLIGENCE_REPORT.md` (delivery report).
