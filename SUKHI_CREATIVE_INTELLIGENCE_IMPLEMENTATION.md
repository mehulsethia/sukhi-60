# Sukhi — Creative Intelligence & Adaptive Behaviour Engine

**Implementation specification for Cursor / Claude Code**  
**Status:** Pilot MVP implementation brief  
**Primary instruction:** Implement within the existing Sukhi application. Inspect the repository before editing. Do not rebuild the app or invent unrelated features.

## 0. Instructions for the coding agent

You are working in the existing Sukhi codebase. Your job is to implement the changes below, preserving the current user journey, visual design, language handling, and working features.

1. Inspect the project structure, current onboarding screens, plan creation flow, habit models, notification/voice delivery, APIs, persistence, auth, and tests.
2. Write a short repository-specific implementation plan identifying existing components to reuse and the exact files you intend to modify. **Do not assume any framework, database, model provider, or route names.**
3. Implement in small, testable increments. Prefer extending existing services and models over creating parallel systems.
4. Keep existing onboarding at **eight steps**. Integrate the two required questions into existing steps rather than adding extra screens. Make the optional inputs skippable.
5. Keep current UI styling, color tokens, accessibility, localization, and navigation patterns. Do not redesign the homepage or landing page.
6. Add database migrations and backward-compatible defaults where needed. Existing users must not be forced through onboarding again.
7. Do not introduce autonomous clinical advice, diagnosis, dosage adjustments, or changes to clinician-approved care plans.
8. If a product detail is unspecified or the codebase makes an assumption unsafe, document it under `OPEN_QUESTIONS.md` and implement the least disruptive safe fallback. Do not invent product requirements.
9. At the end, report changed files, migrations, environment variables, test results, remaining limitations, and manual QA steps.

### Scope boundaries

**Build now:** short behavioral onboarding, persisted preference profile, habit event logging, missed-habit reason capture, rules-based nudge/restart decisions, optional LLM wording generation behind strict controls, anti-repetition logic, basic learning from interactions, privacy controls, and pilot analytics.

**Do not build now:** new personality tests, personality archetype labels, extensive hobbies surveys, reinforcement-learning infrastructure, complex rewards, autonomous health recommendations, wearable integration, hospital dashboards, or major app redesign.

## 1. Product intent

Sukhi should evolve from a generic reminder/habit tracker into an adaptive wellbeing companion that learns which kinds of supportive messages help each person sustain a chosen routine.

**Core loop:** `Plan → Check in → Observe → Understand barrier → Select safe support → Confirm → Track → Learn → Sustain`.

The system should distinguish **what** intervention is allowed (deterministic policy and safety rules) from **how** the intervention is worded (templates or constrained LLM). A missed habit is a recovery opportunity, not a reason to shame the user or reset progress.

The proposed internal architecture is **Sukhi Adaptive Behaviour & Creative Intelligence Engine (ABCIE)**. These are logical modules and need not be separate services.

## 2. Preserve and minimally update eight-step onboarding

Map the existing repository screens to the following functional steps. Exact current screen names may differ; do not rename or reorder screens without a concrete need.

| Existing step | Required action | Pilot behavior |
|---|---|---|
| 1. Language selection | Retain | Keep existing language choice and localization |
| 2. How Sukhi helps | Retain | Optional small copy clarification; no new workflow |
| 3. Name and timezone | Retain | No change to required fields |
| 4. Check-in timings | Retain | Store preferred times; no automatic rescheduling without user confirmation |
| 5. About your plan | Retain + optional | Optional personal motivation, short free text or skip |
| 6. Comfort and reminders | **Modify** | Add two visual, accessible behavioral-preference questions below |
| 7. Permissions | Retain | Explain notification, data use, and family sharing separately where relevant |
| 8. Start with one routine | Retain + optional | Optional confidence rating from 1 to 10; skip allowed |

### Required question A — communication style

**Prompt:** “How would you like Sukhi to talk to you?”  
**Instruction:** “Choose one or two.”

| Stored value | User-facing option | Meaning |
|---|---|---|
| `warm_gentle` | Warm and gentle | Kind encouragement |
| `fun_playful` | Fun and playful | Light humor and friendly conversation |
| `motivating` | Motivating | Goal-oriented encouragement and small challenges |
| `simple_practical` | Simple and practical | Short, clear reminders |

Use illustrated/icon-based choice cards **using existing icon assets**. Allow selecting 1–2; allow skip if needed for frictionless onboarding. Default to `warm_gentle` when no preference is provided. Do not infer a psychological diagnosis or permanent personality type from this answer.

### Required question B — preferred restart support

**Prompt:** “When you miss a habit, what helps you most?”

| Stored value | User-facing option |
|---|---|
| `encouragement` | A little encouragement |
| `simpler_alternative` | Help finding a simpler alternative |
| `gentle_push` | A gentle push to restart |
| `give_space` | Some space before checking in again |

Single-select; skippable; default to `encouragement`. A user choosing `give_space` should receive fewer recovery prompts, not be silently excluded from necessary safety or user-requested notifications.

### Optional fields

- `personal_motivation`: short text explaining why the user wants to build this routine. Optional, length-limited, editable, and never used to make medical claims.
- `habit_confidence`: integer 1–10, optional, associated with the initial habit or plan (not necessarily the whole user profile).

### Onboarding UX requirements

- Large touch targets, legible text, high contrast, accessible labels, voice/screen-reader compatibility where supported.
- Short prompts; minimal typing; all optional questions visibly skippable.
- Localize all new UI strings through existing i18n infrastructure. Preserve existing Marathi/Hindi/English behavior; do not hardcode English in production components.
- Show a concise summary/confirmation before saving if the current flow already supports one.
- No extra onboarding screens, modal quiz, or long survey.
- Reuse existing analytics events if available; do not collect sensitive free text in analytics payloads.

## 3. Data model — adapt names to the existing schema

The following is a **logical schema**, not an instruction to create these exact tables if equivalent models already exist. Store timestamps in UTC, apply existing user-scoping and authorization, and version new preference structures.

### `BehaviourProfile`

```ts
type CommunicationStyle =
  | 'warm_gentle'
  | 'fun_playful'
  | 'motivating'
  | 'simple_practical';

type RestartPreference =
  | 'encouragement'
  | 'simpler_alternative'
  | 'gentle_push'
  | 'give_space';

interface BehaviourProfile {
  userId: string;
  schemaVersion: 1;
  communicationStyles: CommunicationStyle[]; // 0–2; fallback warm_gentle
  restartPreference: RestartPreference | null; // fallback encouragement
  personalMotivation?: string | null;          // optional, bounded
  preferredCheckinTimes?: string[];            // existing scheduling model if present
  updatedAt: string;
  explicitPreferenceUpdatedAt?: string | null;
}
```

**Do not overwrite explicit user choices with learned preferences.** Keep learned signals separate and allow the user to edit their stated preferences.

### `HabitConfidence`

```ts
interface HabitConfidence {
  userId: string;
  habitId: string;
  confidence: number | null; // integer 1–10, nullable
  recordedAt: string;
}
```

### `HabitEvent` (append-only where feasible)

```ts
type HabitEventType =
  | 'scheduled' | 'completed' | 'skipped' | 'missed'
  | 'rescheduled' | 'alternative_accepted' | 'alternative_declined';

interface HabitEvent {
  id: string;
  userId: string;
  habitId: string;
  eventType: HabitEventType;
  occurredAt: string;
  source: 'user' | 'system' | 'import';
  // Optional idempotency key for retry-safe ingestion.
  idempotencyKey?: string;
}
```

A **missed** event must be derived only after the habit's configured completion window closes, using the user's timezone and existing schedule. A missing reply does **not** prove the activity was not performed. Preserve `unknown/no_response` separately if the existing tracker supports it. Never infer medication adherence from silence.

### `BarrierReport`

```ts
type BarrierCode =
  | 'forgot' | 'busy' | 'low_motivation' | 'routine_disrupted'
  | 'too_difficult' | 'physical_discomfort' | 'other' | 'prefer_not_to_say';

interface BarrierReport {
  id: string;
  userId: string;
  habitId: string;
  relatedHabitEventId?: string;
  barrierCode: BarrierCode;
  createdAt: string;
  // Avoid storing free-text health details unless necessary and consented.
}
```

### `NudgeEvent`

```ts
type NudgeKind = 'scheduled_checkin' | 'gentle_reminder' | 'barrier_question'
  | 'restart_offer' | 'positive_reinforcement';

interface NudgeEvent {
  id: string;
  userId: string;
  habitId?: string;
  kind: NudgeKind;
  strategyId: string;           // deterministic intervention decision
  styleUsed: CommunicationStyle;
  templateOrVariantId: string;  // for repetition analysis
  createdAt: string;
  deliveredAt?: string | null;
  acknowledgedAt?: string | null;
  outcome?: 'completed' | 'dismissed' | 'no_response' | 'unknown';
  // Store generated message text only if required by product and privacy policy.
}
```

### `LearnedBehaviourSignals`

```ts
interface LearnedBehaviourSignals {
  userId: string;
  habitId?: string;
  observedCompletionByTimeWindow?: Record<string, number>;
  styleResponseCounts?: Partial<Record<CommunicationStyle, { sent: number; engaged: number }>>;
  recentBarrierCodes?: BarrierCode[];
  lastUpdatedAt: string;
}
```

Use simple aggregated counters initially. Do not infer that engagement equals causation. No black-box behavioral score is required for MVP.

### Migration and compatibility

- Use nullable fields and defaults; backfill only where necessary.
- Existing accounts retain their habits and notifications.
- Offer new preference questions in settings or a non-blocking prompt to existing users; do not require repeat onboarding.
- Add user-level access control to all reads/writes.
- Honor deletion/export and retention mechanisms already in the product; define retention for newly collected events before production deployment.

## 4. Logical architecture

Implement as modules or functions within the current stack:

1. **User Profile Engine:** reads explicit preferences, preferred times, and chosen habits.
2. **Behavioural Intelligence Engine:** consumes habit events and barrier reports; calculates simple patterns.
3. **Adaptive Decision Engine:** selects the next permitted intervention with deterministic rules.
4. **Creative Nudge Engine:** renders the selected intervention in the chosen communication style.
5. **Gentle Restart Engine:** asks about barriers and proposes safe, user-confirmed adjustments.
6. **Learning & Optimization Engine:** updates aggregate observations and reports pilot metrics.

Recommended pipeline:

```text
Existing plan / schedule
  → Check whether an action is due or overdue
  → Read user preferences and recent history
  → Apply safety and notification constraints
  → Decide intervention type with explicit rules
  → Select approved template or constrained LLM phrasing
  → Deliver through existing channel
  → Record event and user response
  → Update aggregates for future suggestions
```

The decision layer must work **without an LLM**. LLM wording is an optional enhancement, not a dependency for completing habits or delivering essential reminders.

## 5. Deterministic decision policy — MVP

### Trigger policy

- Scheduled check-in: follow existing user-approved schedule.
- First reported or confirmed missed habit: one gentle, nonjudgmental follow-up at an appropriate permitted time; ask whether the user wants help.
- If the user agrees, ask **one short barrier question** with tappable options and voice response if supported.
- If no response, do not label the habit as definitely skipped; follow existing quiet-hours and rate-limit settings.
- If user chooses `give_space`, reduce optional restart follow-ups and respect opt-out.
- After repeated misses, offer a smaller or differently timed **non-clinical** action, only if safe and confirmed by the user.
- Never automatically alter a user's chosen schedule or care plan based only on observed patterns.

The earlier idea of thresholds such as one miss/two misses is a **pilot hypothesis**, not an established clinical or behavioral rule. Keep thresholds configurable and easy to adjust; do not hardcode them across multiple files.

### Barrier → intervention mapping

| Barrier | Decision | User-facing behavior |
|---|---|---|
| `forgot` | `suggest_reminder_time` | Ask if another reminder time would help; change only after confirmation |
| `busy` | `suggest_reschedule` | Offer a convenient alternate time |
| `low_motivation` | `switch_encouragement` | Use preferred supportive style; optionally remind user of their own stated motivation |
| `routine_disrupted` | `offer_flexible_plan` | Ask about a new time or next suitable opportunity |
| `too_difficult` | `offer_smaller_action` | Suggest a smaller **non-clinical** version when appropriate |
| `physical_discomfort` | `safety_first` | Do not generate exercise substitutions; direct to appropriate professional support as needed |
| `other` / `prefer_not_to_say` | `supportive_checkin` | Avoid assumptions; offer to try again later |

### Safety constraints

- **Never** independently modify medication schedules, doses, prescribed diets, rehabilitation, or clinician-approved exercise.
- Never suggest compensating for a missed medication dose.
- A user reporting new, severe, or concerning symptoms must not receive an improvised activity alternative. Use the existing escalation pathway; if none exists, provide a conservative, localized message advising appropriate medical assistance and flag for product/clinical review. Do not invent a diagnosis.
- Do not send family alerts without valid, specific consent and a defined trigger policy.
- Avoid guilt, pressure, threats, infantilizing language, streak resets, or promises of extended lifespan / disease prevention.
- Reward safe participation and restarting, not unsafe over-completion.

### Example decision pseudocode

```ts
function chooseSupport(ctx: DecisionContext): SupportDecision {
  if (!ctx.userAllowsContact || ctx.inQuietHours || ctx.rateLimitExceeded) {
    return { kind: 'none', reason: 'contact_not_permitted' };
  }
  if (ctx.hasConcerningSymptomReport) {
    return { kind: 'safety_first', reason: 'symptom_report' };
  }
  if (!ctx.missIsConfirmed) {
    return { kind: 'gentle_checkin', reason: 'status_unknown' };
  }
  if (ctx.restartPreference === 'give_space' && !ctx.userRequestedHelp) {
    return { kind: 'none', reason: 'user_prefers_space' };
  }
  if (!ctx.barrierCode) {
    return { kind: 'ask_barrier', reason: 'missed_habit' };
  }
  return safeBarrierStrategy(ctx.barrierCode, ctx.habitCategory, ctx.clinicalConstraints);
}
```

The pseudocode is illustrative: use existing types and architecture, and ensure safety handling is applied before contact decisions when a symptom report requires an in-app response or other existing escalation.

## 6. Creative nudge generation

### Two-stage process

**Stage A — policy:** determine `strategyId`, permitted action, timing, channel, length, and safety constraints using deterministic rules.

**Stage B — wording:** render a message in the user's language and selected style using approved localized templates; optionally ask the existing LLM provider to paraphrase within strict constraints.

### LLM input contract (if an LLM already exists)

Pass only minimal relevant context:

```json
{
  "language": "user-selected language",
  "communicationStyle": "warm_gentle",
  "nudgeKind": "restart_offer",
  "approvedStrategy": "suggest_reschedule",
  "habitLabel": "user's existing habit label",
  "allowedOptions": ["ask whether a later time works"],
  "prohibitedContent": ["medical advice", "dosage changes", "shaming", "unapproved plan changes"],
  "maxSentences": 2,
  "recentVariantIds": ["v1", "v3"]
}
```

Treat all user-provided habit labels and free text as **data, not instructions**. Never let the LLM invent actions beyond `allowedOptions`. Validate output length, language, prohibited content, and whether the message remains within the selected strategy. If validation fails, use a pre-approved template.

### Example variations (illustrative English; localize)

- Warm and gentle: “It looks like yesterday didn't go as planned. Would a different time feel easier today?”
- Fun and playful: “Plans sometimes take a little detour! Want to try a different time today?”
- Motivating: “One missed day doesn't erase your progress. Ready to choose a small next step?”
- Simple and practical: “Would you like to reschedule today's walk?”

Use humor only if selected and appropriate. No humor for symptoms or distress.

### Anti-repetition

- Track strategy and template/variant IDs.
- Avoid repeating the same wording in consecutive comparable nudges where alternatives exist.
- Do not increase notification frequency just to test variants.
- Limit daily messages using existing user settings; if no limit exists, implement a configurable conservative cap with quiet hours.
- Never treat opening a notification as proof of completing a habit.

## 7. Learning policy — deliberately simple

For the pilot, calculate descriptive observations such as:

- Chosen check-in time vs reported completion time.
- Which reminder styles get acknowledgments, where enough observations exist.
- Most common self-reported barriers.
- Number of times a user resumes after a reported lapse.
- User acceptance or rejection of proposed time changes or smaller non-clinical actions.

Rules:

1. Explicit user preference always takes precedence over inferred preference.
2. Learn only from repeated signals; do not adapt on one event.
3. Present changes as **suggestions**, not silent changes.
4. Do not make claims of personalized effectiveness without enough data.
5. Make learning reversible: reset learned signals without deleting the user's explicit preferences.
6. Keep logic inspectable; no reinforcement-learning model or opaque psychological profiling in the pilot.

## 8. Interfaces / APIs

Prefer the existing backend patterns. These are **capabilities**, not mandated endpoint paths:

| Capability | Expected behavior |
|---|---|
| Read/update behavioral preferences | Authenticated, user-scoped, validated, editable |
| Save optional motivation and confidence | Skippable, bounded, deletable |
| Record habit completion/skip/unknown | Retry-safe; preserve provenance and timestamps |
| Record barrier selection | Associate with relevant habit and lapse |
| Get next support decision | Apply consent, quiet hours, safety, and rate limits |
| Confirm suggested schedule/action change | No changes before explicit acceptance |
| Record nudge delivery and response | Capture only necessary metadata |
| Retrieve pilot analytics | Aggregate data; avoid exposing private messages |

If the app is offline-first, queue events safely and deduplicate when synced. If not, do not introduce offline sync as a separate MVP feature.

## 9. Pilot metrics and event definitions

Define a metric dictionary in code/docs so the team does not confuse reminders with completed actions.

| Metric | Operational definition |
|---|---|
| Onboarding completion | Users finishing existing onboarding / users starting it |
| Habit completion rate | Self-reported completed scheduled habit opportunities / opportunities with known status; show unknown separately |
| Recovery after lapse | Users with a reported/confirmed lapse who subsequently report completing that habit within a defined follow-up window |
| Sustained consistency | Weekly habit completion pattern over the 2–4-week pilot |
| Nudge engagement | Acknowledged nudges / delivered nudges, with delivery unknowns excluded or shown separately |
| Barrier distribution | Counts of voluntarily reported barrier categories |
| Suggestion acceptance | Accepted schedule/action suggestions / suggestions shown |
| Satisfaction | Brief optional feedback from users, not inferred from click rate |

All metrics are descriptive. Do not present causal proof of habit change from a small uncontrolled pilot.

Pilot assumption: approximately **10–20 families for 2–4 weeks**, subject to the team's actual recruitment and study plan.

## 10. Privacy, consent, and security

- Minimize collected data; avoid unnecessary symptom narratives and raw conversation storage.
- Use explicit, understandable consent for any new sensitive profile collection and family sharing where applicable.
- Keep family access separate from the user's own behavioral data permissions. Do not share private conversations or personal motivation by default.
- Apply current authentication, authorization, encryption, and audit conventions.
- Do not log personal motivation, health text, or LLM prompts to third-party analytics by default.
- Provide a way to review/change communication and restart preferences.
- Align data retention and deletion with existing policy; obtain legal/privacy review before deployment, particularly for Indian data protection requirements.

## 11. Tests and acceptance criteria

### Automated tests

- Communication-style selection allows at most two options; skip and defaults work.
- Restart preference is single-select and editable.
- Optional motivation and confidence save correctly; confidence accepts only integer 1–10.
- Existing users and onboarding flow continue to work without new required fields.
- No extra onboarding steps appear.
- Missing response remains `unknown`, not automatically `skipped`.
- Barrier mapping returns the correct strategy.
- `give_space`, quiet hours, opt-out, and rate limits prevent unnecessary nudges.
- A proposed time change requires explicit confirmation.
- Medication/prescribed-care actions are never autonomously modified.
- Physical discomfort/symptom reports bypass creative exercise suggestions.
- Failed/unsafe LLM output falls back to an approved template.
- Repeated variants are reduced where alternatives exist.
- Event ingestion is idempotent; users cannot access each other's records.
- Analytics exclude unknown statuses from completion numerators and report them separately.

### Manual QA scenarios

1. New user selects Marathi, warm + practical, and encouragement; completes eight-step onboarding.
2. User skips both new questions; receives sensible defaults and can edit later.
3. User misses a walk, selects “busy,” and receives an option to choose another time; original schedule stays until accepted.
4. User says “I forgot”; Sukhi offers a different reminder time, not a lecture.
5. User reports knee pain; Sukhi does not suggest stretches or substitute exercises without appropriate clinical safeguards.
6. User prefers space; Sukhi does not repeatedly chase them.
7. User completes an activity after a missed day; previous progress is preserved.
8. Existing account upgrades without losing plans, notifications, or history.
9. LLM service is unavailable; approved templates still work.
10. Voice and screen-reader paths remain usable for the new options.

### Definition of done

- Existing onboarding remains eight steps and visually consistent.
- Two behavioral questions are available within existing flow.
- Preferences are stored, editable, and backward compatible.
- Missed-habit barrier capture and deterministic recovery strategies work.
- Nudge variants respect preferences, language, anti-repetition, and safety.
- Events support basic pilot measurement.
- Tests pass; migration and manual QA notes are provided.
- No new clinical advice or major feature expansion is introduced.

## 12. Recommended implementation sequence

**Phase 1 — Discovery:** map existing components, models, schedules, localization, consent, and tests. Produce file-by-file plan.

**Phase 2 — Profile & onboarding:** add schema/migration, UI questions, optional fields, validation, settings edits, localization, tests.

**Phase 3 — Event tracking:** normalize completion/unknown/missed states, barrier capture, nudge logs, retry safety, tests.

**Phase 4 — Decision & restart:** deterministic barrier mapping, quiet hours, confirmation flows, clinical guardrails, tests.

**Phase 5 — Creative messaging:** localized template variants, optional constrained LLM adapter, fallback, repetition prevention, tests.

**Phase 6 — Learning & pilot reporting:** aggregate signals, suggestion rules, metric definitions, dashboard/report using existing admin tooling if available, end-to-end QA.

Do not add a new dashboard framework solely for pilot analytics; a safe internal report/export is sufficient if no admin view exists.

## 13. Required delivery report from Cursor / Claude Code

After implementing, provide:

1. Repository components inspected and reused.
2. Files added/changed, grouped by feature.
3. Database migrations and how to apply/rollback them.
4. Environment variables or service credentials required (never print secrets).
5. Automated tests run and their actual results.
6. Manual QA scenarios tested and not tested.
7. Known limitations, deferred features, and open product decisions.
8. Any required clinical, legal, privacy, or localization review before pilot launch.

## 14. Source-of-truth and unresolved choices

This document translates the team's discussion into implementation requirements. The following were **not specified** and must be resolved against the existing repository or raised as questions rather than invented:

- Exact codebase framework, ORM, API route naming, database, and deployment setup.
- Existing notification caps, quiet hours, voice provider, LLM provider, and language coverage.
- Final approved translations and illustration/icon assets.
- Exact pilot thresholds for repeated misses and sufficient observations to suggest a timing change.
- Detailed clinical escalation protocol and who, if anyone, receives alerts.
- Event retention periods and consent text approved for launch.
- Whether medication reminders are in scope for the current pilot.

**Final product principle:** Ask only enough to get started. Learn gradually from everyday interactions. Help users resume routines with respectful, safe, practical support—without overwhelming them or rebuilding Sukhi.
