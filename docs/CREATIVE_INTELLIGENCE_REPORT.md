# Creative Intelligence & Adaptive Behaviour Engine: delivery report

Spec: `SUKHI_CREATIVE_INTELLIGENCE_IMPLEMENTATION.md`. Plan: `docs/CREATIVE_INTELLIGENCE_PLAN.md`.
Open decisions: `OPEN_QUESTIONS.md`.

## 1. Components inspected and reused
- Onboarding (`OnboardingForm.tsx`, `completeOnboarding`): kept at 8 steps.
- `profiles` and Settings.
- `check_ins` and `apply_check_in_internal`: idempotent check-ins, so no new completion
  table was needed.
- `apply_silence_rule`: silence becomes `no_response`, never `missed`.
- `runCheckins`: consent, quiet hours, reminder frequency and idempotent messages.
- Safety screens in `src/domain/safety.ts`.
- The `guard_plan_item` trigger and the draft → confirm pattern.
- `getModel` with the `ai_processing` consent.
- `next-intl` and the en/hi/mr message files.
- The `/admin` dashboard and CSV export.
- The "Welcome back" reward, so progress is never reset.

How the spec's `HabitEvent` maps onto existing data:

| Spec event | Where it lives |
|---|---|
| scheduled | `action_occurrences` |
| completed / skipped / missed | `check_ins` |
| unknown | `no_response` status |
| rescheduled / alternative accepted or declined | `support_suggestions.status` |

## 2. Files

**Profile and onboarding**
- `supabase/migrations/20261113000800_behaviour_engine.sql`
- `src/domain/behaviour.ts`
- `src/components/SupportChoices.tsx`
- `src/components/SupportPrefsForm.tsx`
- `src/app/onboarding/OnboardingForm.tsx`:
  - step 5: motivation
  - step 6: questions A and B
  - step 8: confidence
- `src/app/actions.ts`: `completeOnboarding`, `saveSupportPreferences`, `resetLearnedSignals`, `dismissSupportPrompt`
- `src/app/(app)/settings/page.tsx`: Support style section
- `src/app/(app)/today/page.tsx`: existing-user prompt
- `messages/{en,hi,mr}.json`: `onb.*` additions and `support.*`

**Events, decisions and restart**
- `src/server/support.ts`: `reportBarrier`, `decideSuggestion`, `respondToNudge`, `runRestartFollowup`, `getLearnedSummary`
- `src/components/SupportFlow.tsx`
- `src/components/ActionCard.tsx`: reason chips on Skip
- `src/components/ChatClient.tsx` and `src/app/(app)/chat/page.tsx`: follow-up chips
- `src/server/checkins.ts`: the follow-up hook, first slot of the day only
- `src/app/actions.ts`: `checkIn` barrier handling, `reportBarrierAction`, `decideSuggestionAction`, `respondToNudgeAction`

**Creative messaging**
- `src/domain/nudges.ts`: templates, style/variant rotation, validation, LLM fallback
- `src/lib/config.ts` and `.env.example`: `SUPPORT_LLM_WORDING`

**Learning and reporting**
- `src/domain/learning.ts`: signals and `METRIC_DEFINITIONS`
- `supabase/migrations/20261113001100_behaviour_metrics.sql`
- `src/server/admin.ts`
- `src/app/admin/page.tsx`: Adaptive support section
- `src/app/admin/export/route.ts`: `?type=support`

**Generated types**
- `src/lib/database.types.ts`

**Tests**
- `tests/unit/behaviour.test.ts`: 27 tests
- `tests/integration/behaviour.test.ts`: 10 tests

## 3. Migrations
- `20261113000800_behaviour_engine.sql`:
  - nullable or defaulted profile columns
  - tables `habit_confidence`, `barrier_reports`, `nudge_events`, `support_suggestions`
  - RLS: users can read their own rows; the server writes; confidence is insert-own
- `20261113001100_behaviour_metrics.sql`: the `admin_behaviour_metrics` RPC, service role only.
- **Apply.** Locally: `supabase migration up --local`, then `pnpm db:types`. Production:
  `supabase db push --db-url <session pooler URL>`, as done for earlier migrations.
- **Status.** Both are applied locally only, not in production.
- **Rollback** (no down migrations exist in this repo). Do this manually:
  1. `drop function admin_behaviour_metrics`.
  2. Drop the four tables.
  3. `alter table profiles drop column communication_styles, restart_preference, personal_motivation, behaviour_schema_version, behaviour_prefs_updated_at, learning_reset_at`.

  Existing data is unaffected.

## 4. Environment
- `SUPPORT_LLM_WORDING` is optional and defaults to `false`.
- When it's on, it uses the existing `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.
- No new secrets.

## 5. Automated tests (actual results)
- `pnpm test`: **153/153 passed** (13 files), against the local Supabase stack.
- One WhatsApp test failed at baseline, before any change in this work, and passed on
  the final run. It's time-dependent (flaky) and unrelated to this work.
- `pnpm typecheck` and `pnpm lint` were clean for this work.
- At the end, another session's in-progress files (`src/server/plan-reading.ts`, an unused
  import in `actions.ts`) showed type and lint issues. Those aren't from this work.
- `pnpm build` was not run, because that work was mid-edit.

## 6. Manual QA
Not run in a browser in this session. Scenarios 1–10 from the spec need a manual pass:
- Marathi plus two styles
- skipping both questions, then editing them in Settings
- busy → new time, kept until saved
- forgot
- pain → safety message
- give_space
- restart after a miss, with progress kept
- existing account upgrade
- LLM off → templates
- screen reader and voice on the new cards

The decision paths behind scenarios 3–9 are covered by the integration tests.

## 7. Limitations and deferred work
- No WhatsApp barrier chips.
- No satisfaction survey.
- No self-service export of the new tables.
- "Smaller version" is user-authored in My plan.
- Timing observations are shown in Settings as text with no one-tap apply. The barrier
  flow does pre-fill the observed time.
- Learning is descriptive counts only (by design).

## 8. Reviews needed before the pilot
- **Clinical:** escalation protocol and medication scope.
- **Legal/privacy:** DPDP, retention and consent copy.
- **Native-speaker:** Hindi/Marathi.
- **Team:** tuning `BEHAVIOUR_POLICY`.
