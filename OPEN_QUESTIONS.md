# Open questions: Creative Intelligence & Adaptive Behaviour Engine

These were not specified in `SUKHI_CREATIVE_INTELLIGENCE_IMPLEMENTATION.md`, or the codebase
made an assumption unsafe. Each entry gives the safe fallback that's in place now. None of
these is a final product decision.

## Product and policy

1. **Pilot thresholds.** All of them live in `BEHAVIOUR_POLICY` (`src/domain/behaviour.ts`)
   and are hypotheses: 1 proactive recovery message per day, 3 days between follow-ups for
   "give me space", 2 days between follow-ups about the same item, 2 lapses in 7 days before
   "try it a simpler way" wording, 4 agreeing completions (≥75%, median shift ≥60 min)
   before a timing observation, a 21-day learning window, 3-day suggestion expiry and a
   3-day recovery window. *Needs:* team or study-design sign-off.
2. **When the proactive follow-up is sent.** It goes with the first check-in slot of the
   day, and only about yesterday's lapses. Users with no check-in times get no proactive
   follow-up (they still get barrier chips when they tap Skip). *Needs:* confirmation.
3. **"Smaller version" content.** Sukhi never makes up a smaller activity. Accepting opens
   My plan, where the user writes the smaller version and confirms it through the existing
   draft → confirm flow. *Needs:* a decision on whether approved, non-clinical smaller
   variants should be offered per template.
4. **"Forgot" means changing the action time.** In this app the reminder time is the
   action's scheduled time, so "a different reminder time" moves that one time, and only
   after the user confirms. A separate reminder offset is not modelled. *Needs:* confirmation.
5. **Barrier on a silent (no-reply) occurrence.** Recording a barrier does not change the
   occurrence's status (it stays `no_response`), so silence is never turned into "missed"
   automatically. *Needs:* confirmation that analytics should keep it as unknown.
6. **Existing users.** A dismissible card on Today links to Settings → Support style. It
   isn't shown right after onboarding (`?welcome=1`). Dismissal is stored per device in a
   cookie.
7. **Satisfaction metric.** Not collected. It needs an approved, optional feedback question.

## Clinical and safety

8. **Escalation protocol.** No clinical escalation pathway exists in the repo beyond the
   chat's deterministic concern screen and a fixed escalation message. "Pain or discomfort"
   shows a conservative localized message: don't push through it, check with your
   doctor/care team, and call 112 if it's severe or sudden. Nothing is routed to a person
   and no family alert is sent. *Needs:* a clinical owner and protocol.
9. **Medication reminders in scope?** Medication items and any item from a clinician's
   plan are never re-timed or shrunk by this engine. They get "keep your plan as written,
   ask your care team" wording. *Needs:* confirmation that this is the desired pilot scope.
10. **Concern screen false positives.** The existing broad screen matches words like
    "fits"/"fit". Templates were reworded to avoid it. It wasn't loosened.

## Privacy, legal and retention

11. **Retention period** for `barrier_reports`, `nudge_events`, `support_suggestions` and
    `habit_confidence`. These are currently deleted only with the account (cascade). *Needs:*
    a retention period before production, plus legal/privacy review (DPDP Act).
12. **Consent text.** Collecting communication style, restart preference, motivation and
    confidence relies on the existing onboarding and privacy copy. No new consent toggle
    was added, because the data is optional and self-stated. *Needs:* privacy review. The
    personal motivation isn't sent to the LLM, analytics or family members.
13. **Data export.** The app has no self-service export of a user's own data beyond the
    family summary preview, so the new tables aren't in an export yet.

## Localisation and assets

14. **Hindi/Marathi copy** for all new strings and template variants was written without
    native review, same as the rest of the app. *Needs:* native-speaker review (gendered
    forms such as "भूल गया/गई" especially).
15. **Icons.** The existing lucide-react set (Heart, Smile, Target, ListChecks, HandHeart,
    Footprints, RotateCcw, Hourglass) is used. No illustrations were added.

## Technical

16. **LLM wording** is off by default (`SUPPORT_LLM_WORDING`). When on, it needs a model
    key, AI consent, an 8 s timeout and validation, and falls back to the template. It
    hasn't been live-tested, because no local `ANTHROPIC_API_KEY` exists.
17. **WhatsApp.** Restart follow-ups and barrier chips are in-app (chat and Today) only.
    WhatsApp needs approved templates or interactive messages.
