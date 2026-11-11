# SUKHI 60 — Final UI, Branding & Product Specification

**Version:** 1.0  
**Date:** 12 November 2026  
**Purpose:** Implementation handoff for UI/UX, frontend, backend, copywriting, QA and pilot operations  
**Status:** Agreed design direction; proposed implementation specifications, with unresolved decisions explicitly marked  
**Visual reference:** The final Sukhi screenshot supplied in the conversation (`image.png`); any generated mockups are directional, not pixel-perfect component definitions.

> **Executive decision:** Use a minimal, accessible sky-blue / teal / white design. Sukhi is a voice-first, creatively intelligent wellbeing companion, initially designed around older adults' everyday habits. Its differentiator is *helping people restart after missed activities*, not merely sending reminders. **Do not reintroduce pink-heavy, butter-yellow, or multicolour palettes.**

> **Scope note:** This document records the final UI and brand specification from the preceding conversation. The earlier business decks frame Sukhi 60 as a wellness companion for adults 60+; proposals to pivot toward a condition-specific care-plan product are **not** incorporated as approved changes. Medication scope, family escalation and advanced multilingual support remain decisions requiring validation.

## 1. Product overview and positioning

| Dimension | Agreed / proposed definition |
|---|---|
| Public brand | **Sukhi** |
| Product / working name | **Sukhi 60** |
| Category | Voice-first, culturally relevant wellbeing and habit-support companion |
| Primary intended users | Adults aged 60+; initial smartphone-capable testing persona may include adults aged 55–70 |
| Potential payer | Adult children / families; willingness to pay not yet validated |
| Product problem | Healthy habits are easy to recommend and difficult to sustain; an interrupted routine can lead to disengagement |
| Core promise | Help people turn everyday intentions into manageable habits, stay consistent and gently restart when life interrupts |
| Differentiator | A **Gentle Restart Loop** that learns barriers and offers safe, practical alternatives rather than repetitive alarms |
| Initial habit domains | Movement, nutrition and sleep; medication routines are a supporting feature, pending scope decision |
| Core channels | First: app with text/tap and voice check-ins. WhatsApp and outbound calls are possible future channels, not assumed MVP deliverables |
| Emotional value | Autonomy, dignity, reassurance and encouragement without pressure |

**Primary positioning line:** **Your health in your own hands.**  
**Secondary positioning line:** **Your creatively intelligent health companion.**  
**Supporting line:** **Small steps today. A healthier tomorrow.**  
**Behaviour promise:** **Life happens. Sukhi adapts.**

### Positioning rationale

Do not describe Sukhi merely as an AI chatbot, an alarm app, a senior-monitoring system or a medical treatment platform. The user-facing benefit is *feeling supported in everyday action*. Creative intelligence means changing the tone, timing or achievable step when the person has difficulty continuing, subject to safety rules.

### Claims and wording guardrails

- **Do not claim that Sukhi adds 5–10 years of life** or prevents medical emergencies; no such outcomes have been established for this product.
- Safe general phrasing: “Small actions, repeated over time, can make a meaningful difference to long-term wellbeing.” Avoid attributing precise lifespan gains to the app.
- The product supports agreed routines; it does not diagnose, prescribe, determine medication doses or substitute for professional care.
- All future outcome claims require the appropriate evidence and review.

## 2. Final visual direction

**Design name:** Minimal Sky-Blue Wellness.  
**Character:** Calm, optimistic, energetic through clarity and typography, friendly without being childish, inclusive rather than gender-coded, modern without looking clinical.

### 2.1 Colour tokens

The three visible foundation colours are teal, soft sky blue and white. Navy/greys are neutral typography and structural colours. Green and amber are *functional status colours only*, not marketing accents.

| Token | Hex | Primary use |
|---|---|---|
| `color.brand.primary` | `#0B6E5F` | Logo field, primary CTAs, key icons, active controls |
| `color.brand.sky` | `#EAF4FF` | Subtle hero wash, highlighted sections, selected rows |
| `color.surface.base` | `#FFFFFF` | Cards, forms, panels |
| `color.surface.page` | `#F7FBFF` | Global site/app background |
| `color.text.primary` | `#172A42` | Headings and main copy |
| `color.text.secondary` | `#475569` | Supporting copy and metadata |
| `color.border.subtle` | `#DCEAF5` | Borders, separators |
| `color.state.success` | `#16A34A` | Completion icon, positive status text, small success cues |
| `color.state.warning` | `#F59E0B` | Small caution/tip marker only; never a dominant panel |
| `color.state.neutral` | `#64748B` | Skipped, unanswered, paused states |

**Usage rules:**
1. Blue creates atmosphere, white creates clarity, teal communicates primary actions.
2. Use a light page background; never use a dark full-page dashboard background.
3. White cards on pale blue use subtle borders/shadows; no dramatic gradients.
4. Do not assign a bright separate colour to every habit category.
5. Skipped/missed tasks are **not** displayed as bright red failures.
6. Never use colour alone to convey completion; include a word and icon.
7. Small sunshine/yellow illustration details may remain, but yellow is not a brand base colour.

### 2.2 CSS token starter

```css
:root {
  --sukhi-teal: #0B6E5F;
  --sukhi-sky: #EAF4FF;
  --sukhi-page: #F7FBFF;
  --sukhi-white: #FFFFFF;
  --sukhi-navy: #172A42;
  --sukhi-secondary: #475569;
  --sukhi-border: #DCEAF5;
  --sukhi-success: #16A34A;
  --sukhi-warning: #F59E0B;
  --sukhi-neutral: #64748B;
  --sukhi-radius-card: 16px;
  --sukhi-radius-control: 12px;
  --sukhi-spacing-unit: 4px;
}
```

**Note:** these hex codes are the proposed implementation source of truth; do not sample colours from the AI-generated mockup.

### 2.3 Typography and sizes

| Item | Desktop | Mobile / accessible implementation |
|---|---|---|
| English typeface | Inter | Inter |
| Hindi + Marathi typeface | Noto Sans Devanagari | Noto Sans Devanagari |
| Hero title | 40–48 px | Approximately 30–36 px; responsive wrapping |
| Section title | 28–32 px | 24–28 px |
| Card title | 20–24 px | 20–22 px |
| Body | 16–18 px | Prefer 18 px for primary senior-facing text |
| Supporting copy | 14–16 px | Do not fall below readable 16 px for key instructions |
| Buttons | 16–18 px, semibold | 16–18 px, semibold |
| Touch targets | ≥44 px | Prefer 48 px or larger |
| Card corners | 12–18 px | 12–18 px |
| Cards spacing | 16–24 px | 16–24 px |

**Accessibility:** maintain WCAG AA-appropriate contrast; test real foreground/background pairs, display scaling and Devanagari glyphs. Always provide visible labels, logical keyboard focus, large hit targets, screen reader names, reduced-motion preferences and voice/text parity. One strong action per card wherever possible. Do not copy tiny illustrative text from the screenshot into production.

### 2.4 Logo and illustration

- Keep a simple teal rounded-square icon containing a white leaf, paired with the Sukhi wordmark in deep navy.
- Supply full horizontal logo, compact navigation logo and app icon; recreate clean vector artwork instead of enlarging a raster screenshot.
- Use illustrations sparingly: hero sunrise/pathway, optional small plant/leaf motifs and restrained empty-state illustrations.
- Keep illustrations **secondary** to task and information hierarchy. No large flowers, butterflies, confetti, or busy cartoon scenes in everyday dashboard use.
- The logo visual in the reference is a concept; final vector geometry/assets require designer sign-off.

## 3. Website information architecture and implementation copy

### 3.1 Header

**Desktop structure:** left logo; central links; right login / primary CTA. Use a white or extremely pale blue header with a subtle bottom border.

**Exact labels:** `How it works` · `Benefits` · `Features` · `Why Sukhi` · `FAQs` · `Log in` · `Get started`.

**Mobile:** brand + login access + menu icon; collapsible navigation; maintain primary CTA visibility without clutter.

### 3.2 Hero

**Eyebrow (optional):** `Sukhi 60 — your everyday wellbeing companion`

**Primary H1:** `Your health in your own hands.`

**Hindi/Hinglish:** `Aapki sehat, aapke haath mein.`  
**Marathi (Devanagari):** `तुमची तब्येत, तुमच्या हातात.`  
**Marathi (Romanized reference):** `Tumchi tabyet, tumchya hatat.`

**H2 / emphasis:** `Small steps today. A healthier tomorrow.`

**Body:**

> Healthy habits are easy to recommend, but hard to sustain. Sukhi helps you turn everyday intentions into healthy habits, stay consistent and find your way back whenever life gets in the way.

**Primary CTA:** `Start your health journey with Sukhi`  
**Secondary optional CTA:** `Meet your Sukhi`

**Three micro-benefits:** `Build healthy routines` · `Feel more in control` · `Stay consistent`.

**Layout:** content left / gentle sunrise-and-path illustration right on wide desktop; single column with text first on mobile. White/light blue text areas, dark navy heading, teal buttons. Avoid adding unsupported lifespan numerical claims.

### 3.3 “How Sukhi Works” (four visible steps)

**Heading:** `How Sukhi Works?`  
**Introduction:** `A simple, personal and creative way to build healthy habits — and keep going for the long run.`

#### Step 01 — Your Plan

**Short:** `Your health goals, made manageable.`  
**Full copy:** `Create a simple daily routine based on your goals, preferences and lifestyle. Start with a few small actions that fit your day.`  
**Icon:** clipboard/list.

#### Step 02 — Gentle, Customised Nudges

**Short:** `Not another alarm. A little push when you need it.`  
**Full copy:** `Sukhi sends timely, personalised reminders and creative nudges that fit your routine and help you stay on track.`  
**Icon:** bell.

#### Step 03 — Share it with Sukhi

**Short:** `Did it? Tell Sukhi!`  
**Full copy:** `Went for a walk? Followed your routine? Share a photo, send a voice note or simply tap Done. Sukhi logs your update and celebrates your effort.`  
**Fallback copy:** `Not today? That's okay too. Sukhi helps you understand what got in the way and find a practical way forward.`  
**Icon:** camera / microphone.

Show two sub-states **Did it?** and **Not today?** in this card. Do not require photo upload as proof of completion. Completion remains self-reported unless there is explicit verified device integration.

#### Step 04 — See Your Progress

**Short:** `Every step counts.`  
**Full copy:** `Build streaks, earn points, celebrate milestones and see how your small daily actions add up over time. One missed day never erases your progress.`  
**Icon:** chart/progress.

**UI layout:** four equal cards in a grid on desktop and stacked cards on mobile; ample internal space; simple line icons; step 3 may be slightly emphasized with pale blue but not a bright accent.

### 3.4 “Why Sukhi” differentiation panel

**H2:** `More than a tracker. A personal companion.`  
**Body:** `Sukhi understands your routine, nudges you creatively and helps you bounce back after a slip.`

**Benefits:**
- `Understands your routine.`
- `Encourages you at the right time.`
- `Finds creative ways to help you continue.`
- `Celebrates effort, not perfection.`
- `Helps you build consistency for the long run.`

**Closing line:** `Life happens. Sukhi adapts.`

**Visual layout:** light sky-blue panel, optional restrained phone illustration on left, four or five short benefits on right; stack on mobile.

### 3.5 “Everyday Wellbeing” / domains section

**H2:** `A little care, every day.`  
**Intro:** `Build small, manageable habits across the things that matter.`

| Domain | Copy | Guardrail |
|---|---|---|
| Movement | `Make room for everyday activity.` | Activities appropriate to chosen goals / constraints |
| Nutrition | `Build mindful, sustainable food routines.` | Do not invent medical diets |
| Sleep | `Create a routine that supports better rest.` | Avoid treatment claims |
| Medication reminders | `Stay organised with reminders for your prescribed schedule.` | Supporting feature only; no dosing advice |

### 3.6 Language section

**H2:** `Talk to Sukhi the way you talk every day.`  
**Body:** `Speak, share and interact in the language that feels natural to you. English, Hindi or Marathi — your health journey should feel comfortable and personal.`

**Implementation caveat:** publicly advertise languages only when recognition, synthesis and code-switching quality are validated in the pilot. The first MVP may support Marathi first and add more languages later.

### 3.7 Final CTA and footer

**H2:** `Small steps today. A healthier tomorrow.`  
**Body:** `You don't have to change everything overnight. Start with one small step. Let Sukhi help you keep going.`  
**Button:** `Get started with Sukhi`

**Footer links:** `About Sukhi` · `How it works` · `Privacy` · `Terms` · `Contact` · `FAQs`.

**Disclaimer:** `Sukhi supports everyday wellbeing habits and routines. It is not a substitute for professional medical advice, diagnosis or treatment.`

## 4. Brand language and UI microcopy

### 4.1 Voice rules

Sukhi sounds warm, intelligent, encouraging, respectful, flexible and creative. It should never sound robotic, bossy, judgemental, clinical, childish or repetitive. Do not address missed activities as failure. Do not create pressure to preserve streaks at the expense of health.

| Avoid | Use instead |
|---|---|
| `You failed to complete your task.` | `Didn't get around to it today? That's okay. Let's find another moment.` |
| `Reminder: Walk at 6 PM.` | `Shall we make some time for your evening walk?` |
| `Your streak has been broken.` | `Welcome back! Ready for one small step today?` |
| `You were inactive.` | `I haven't heard from you yet. How did your day go?` |
| `You must complete this.` | `Would you like to try this now or choose another time?` |

### 4.2 Canonical brand strings

| Key | English | Hindi / Hinglish | Marathi |
|---|---|---|---|
| `hero.headline` | Your health in your own hands. | Aapki sehat, aapke haath mein. | तुमची तब्येत, तुमच्या हातात. |
| `hero.subline` | Small steps today. A healthier tomorrow. | Aaj chhote kadam, kal behtar sehat. | आज छोटी पावलं, उद्या अधिक निरोगी आयुष्य. |
| `plan.title` | Your plan, your way. | Aapka plan, aapke tareeke se. | तुमचा प्लॅन, तुमच्या पद्धतीने. |
| `progress.every_step` | Every step counts. | Har kadam maayne rakhta hai. | प्रत्येक पाऊल महत्त्वाचं आहे. |
| `restart.title` | No guilt. Start again. | Koi guilt nahi. Phir se shuru karein. | अपराधी वाटून घेऊ नका. पुन्हा सुरुवात करूया. |
| `keep_going` | Keep going. | Bas aage badhte raho. | पुढे चालत राहा. |

**Translation QA:** Hindi/Marathi marketing strings are proposed drafts, not professionally reviewed localisations. Provide authentic, natural-language review with local older users; avoid mixing translated and transliterated text arbitrarily. Support Devanagari font fallback and locale-specific number/date formatting.

### 4.3 Example assistant responses

**Completed:**

- User: `I completed my evening walk!`
- Sukhi: `That's wonderful! Another little win for today. I've logged your evening walk.`

**Missed due to schedule:**

- User: `I couldn't go for my walk today.`
- Sukhi: `That's okay. Some days don't go as planned. Would you like to try a shorter walk tomorrow, if that fits your plan?`

**Returning after lapse:**

- User: `I haven't followed my plan for a week.`
- Sukhi: `Welcome back! No need to catch up on everything. Let's pick one small thing to restart today.`

**Low motivation:**

- User: `I don't feel motivated.`
- Sukhi: `Let's make it easier. What's one small thing you feel you could manage today?`

**Photo note:**

- User sends activity photo.
- Sukhi: `Thanks for sharing! Would you like me to mark this activity as done?`

**Important:** Avoid implying the app verified completion solely through image understanding. If a clinician-approved plan contains restrictions, proposed activity changes must remain within those restrictions.

## 5. Screens and responsive behaviour

### 5.1 Public landing page

**Components:** Header, Hero, How It Works, Why Sukhi, Domains, Languages, Final CTA, Footer.  
**Desktop:** standard centre-constrained page width, clear content left / image right hero, four-card feature layout.  
**Mobile:** stack content, no tiny columns; CTA visible; no oversized art above the headline.

### 5.2 Logged-in Today dashboard

**First impression:** single clear next action, not a wall of data.  
**Example greeting:** `Good evening, Asha.`  
**Supporting text:** `One small step today, a healthier tomorrow.`

**Required modules:**
1. Greeting + accessible Ask Sukhi entry.
2. Current / next planned activity (name, time, simple target).
3. Main actions: `I did it` · `Later` · `Skip`.
4. Optional `Share a photo or note` (voice, photo or text).
5. Compact weekly consistency summary.
6. Small streak/milestone status, never dominating the screen.

**Illustrative activity card:**

- Time: `6:00 PM`
- Name: `Evening walk`
- Description: `20 minutes, at your own pace.`
- Primary action: `I did it`
- Secondary actions: `Later` / `Skip`
- Utility action: `Share a photo or note`

**State requirements:** loading, empty plan, scheduled, due, completed, later, skipped, no response, offline/retry and error. Never visually equate “no response” with “skipped”.

### 5.3 Sukhi Assistant

**Voice-first** with tap/text alternatives. Components: prominent microphone, transcript/messages, text entry, suggested prompts, language preference, recording status and privacy controls. Suggested greeting: `Namaste! I'm Sukhi. How is your day going?`

**Quick prompts:** `Tell Sukhi how you feel` · `Share what you completed` · `What should I do today?` · `Help me get back on track`.

**Voice requirements:** users must understand when recording starts, ends and fails; allow retry and text fallback. Do not claim language fluency before real testing with elderly Marathi and code-switched speech.

### 5.4 My Plan

Show 2–3 manageable actions initially, arranged by time or domain. Each card exposes name, scheduled time, frequency, current status and Edit/Pause where appropriate. Suggested domains: movement, nutrition, sleep; prescription-based medication reminders only when within approved scope.

**Plan editing:** prevent unsafe automatic replacement of clinician-directed tasks. User-controlled adjustments to time and reminder preference are separate from changes to medically specified activity or dose.

### 5.5 Progress

**Modules:** week grid, activities completed, rescheduled/skipped counts, personal consistency, optional streak, small milestone. Optional visual garden only if it remains lightweight and clearly subordinate to real progress.

**Copy:** `Every step counts.` · `One missed day never erases your progress.`

**Progress calculation:** choose a transparent denominator and distinguish completed, skipped, rescheduled, not due and unanswered. Streak resets should not delete historical achievements.

### 5.6 Family summary (pilot / post-MVP depending scope)

With explicit user-defined permissions, show weekly consistency and agreed milestones and alerts, not the private chat transcript. Allow the user to review/withdraw sharing. Do not make a parent feel surveilled by default.

### 5.7 Navigation pattern

**Desktop sidebar:** `Today` · `Assistant` · `My Plan` · `Progress` · `Settings`. Distinct bottom/side `Ask Sukhi` CTA. Active row uses pale blue.

**Mobile bottom navigation:** `Today` · `Assistant` · `My Plan` · `Progress`. Place `Settings`, language, profile and family permissions in profile/settings. Do not shrink the sidebar into a tiny mobile rail.

## 6. Core interaction and event-state specification

### 6.1 Activity status model

| State | Meaning | Consequence |
|---|---|---|
| `scheduled` | Action planned for later | Reminders allowed per settings |
| `due` | Activity is currently due | Show actionable task |
| `completed` | User explicitly reports done | Log completion; update progress |
| `rescheduled` | User chose Later / new time | Keep task planned for new time; avoid double-count |
| `skipped` | User explicitly chose Skip | Log skip; ask barrier only when appropriate |
| `missed` | Scheduled window expired without confirmed completion, under defined rule | Gentle follow-up; **not proof of inactivity** |
| `no_response` | No reply to a check-in | Do not infer skipped activity or non-adherence |
| `paused` | User intentionally pauses the activity | Suppress nudges until resumed |

**Workflow:** scheduled → due → completed / rescheduled / skipped / unconfirmed; background rules can flag missed/unanswered but do not invent user intentions. Timestamp status transitions and preserve change history.

### 6.2 Did it / Later / Skip interaction

- **I did it:** store user-declared completion (including source: tap/voice/text); show short acknowledgment; update streak/weekly view.
- **Later:** ask/select appropriate alternative time; update schedule; confirm change in accessible language.
- **Skip:** log skip; offer neutral acknowledgment and optionally a single gentle barrier question.
- **Photo/voice update:** collect optional artifact; ask for confirmation before treating it as a completed task.
- **Repeated tap or network retry:** implement idempotent event handling to prevent double completion.

### 6.3 Suggested activity record (conceptual schema)

```json
{
  "activity_id": "ACT001",
  "user_id": "USER123",
  "name": "Evening walk",
  "category": "movement",
  "scheduled_at": "2026-11-12T18:00:00+05:30",
  "timezone": "Asia/Kolkata",
  "frequency": "daily",
  "status": "completed",
  "confirmation": "self_reported",
  "confirmation_channel": "tap",
  "updated_at": "2026-11-12T18:27:00+05:30",
  "user_note": null,
  "adaptation_history": [],
  "privacy_visibility": "private"
}
```

This is an illustrative schema, not an existing backend contract. Data should be collected/minimised based on the next action and approved consent.

## 7. Gentle Restart Loop and creatively intelligent nudges

**Core internal loop:** `Plan → Support → Check in → Learn → Adapt → Restart/Sustain`. Public marketing should still use the simple four-step story.

### 7.1 Proposed MVP decision rules

| Signal | Initial response | Safety / QA note |
|---|---|---|
| One missed activity | Offer same action again with a gentle nudge | Do not blame |
| Two consecutive misses | Ask about a barrier; offer smaller action / different time if compatible with the plan | Threshold is a pilot hypothesis |
| Weather / schedule barrier | Suggest planned indoor or different-time alternative where appropriate | Do not invent unsafe alternatives |
| Low motivation | Make the step less intimidating; celebrate returning | Avoid pressure |
| Pain / unusual symptoms | Stop automatic physical activity suggestions; follow clinician-reviewed safety protocol | No diagnosis or improvised rehabilitation |
| Three silent days | Lower-intensity check-in; consider consent-based family contact | Threshold subject to user choice and pilot evaluation |
| User returns after gap | Welcome back, preserve past progress, offer small restart | Never reset history |

**Decision priority:** explicitly reported barrier → observed timing pattern → previously successful permitted step → user preference. Prefer smaller before radically different. **Rules-first** for MVP, not unbounded generative recommendations.

### 7.2 Behaviour-change rationale

The Behaviour Change Wheel / **COM-B** model (Michie, van Stralen & West, 2011) identifies capability, opportunity and motivation as interacting conditions that shape behaviour. Sukhi should use this as a design lens:

| Barrier class | Product response |
|---|---|
| Capability: does not understand the activity | Short plain-language explanation and accessible instructions |
| Opportunity: bad weather / competing schedule | Offer acceptable alternate timing or context |
| Motivation: feels discouraged | Supportive micro-goal or progress reminder |

The source paper supports the usefulness of COM-B as a framework for intervention analysis; it **does not establish the efficacy of Sukhi or any particular nudge**. Pilot testing must validate behaviour and safety outcomes.

### 7.3 Nudging constraints

- Check notification preferences, quiet hours and cultural context first.
- Do not spam when a person is unresponsive.
- Record which nudge type was sent and whether the user responded.
- Give users control over volume, frequency, channel and stopping messages.
- Avoid implying clinical certainty from an LLM-generated response.
- Escalate red flags through a separately reviewed safety route, not the routine nudging engine.

## 8. Onboarding and personalisation data

**Pilot priority:** concise, not intimidating. Ask only what is needed to create the first 2–3 actions; defer detailed profiling until the need becomes clear.

**Initial setup (proposed):**
1. Preferred name and language.
2. Normal wake/sleep times or preferred reminder windows.
3. Main health-habit interests (movement / food routine / sleep).
4. Choose 2–3 activities and realistic times.
5. Key constraints (only relevant to those activities) and safe-plan boundaries.
6. Consent for notifications, recordings, and optional family sharing.

**Progressive questions, later:** who prepares food, fasting/festival patterns, walking setting, schedule barriers and preferred encouragement tone. Obtain explicit consent before recording health-related self-reports; users must be able to edit their preferences.

**Design rules:** short conversational questions, obvious progress indication, large tap cards, optional visual choices, skip where safe, voice/text parity, no long form and no forced family account during the core onboarding.

## 9. Engineering component inventory

| UI component | Responsibility | States / acceptance requirements |
|---|---|---|
| SiteHeader | Logo, nav, login, CTA | Desktop and collapsible mobile |
| HeroBanner | Headline, translations, illustration, CTA | Responsive, accessible heading order |
| StepCard | Four-step marketing journey | Icon + title + body; step 3 sub-states |
| LanguageSelector | Locale selection | Remember explicit selection; no silent language switching |
| AppSidebar / BottomNav | Logged-in navigation | Active, hover/focus, disabled states |
| GreetingHeader | User greeting | Safe fallback if name/time unavailable |
| ActivityCard | Next planned action | Scheduled/due/completed/later/skip/error |
| CheckInAction | Log activity | Confirmation, idempotency, undo/correction path |
| ShareUpdate | Photo, voice, text | Consent, upload/retry, edit/delete |
| AssistantComposer | Voice/text assistant | Mic state, transcript, error, recording clarity |
| WeekProgress | Consistency overview | Defined denominator; icon/text states |
| StreakMilestone | Optional reinforcement | No pressure or destructive resets |
| FamilyPermissions | Share controls | Explicit consent, revoke, audit trail |
| SafetyMessage | Concerning symptom handling | Clinician-reviewed trigger and response paths |

### 9.1 Frontend quality acceptance

- All controls operable without a mouse.
- Responsive at common mobile widths, tablet and desktop.
- All key flows tested in English and Devanagari text; line wrapping not clipped.
- Loading/empty/error/success states are designed rather than improvised.
- Font zoom and dynamic text size do not obscure controls.
- User sees an accurate description of what each action records.
- No fixed progress graphic uses fabricated live personal metrics.

### 9.2 Backend/system quality acceptance

- Immutable or auditable event record for activity status transitions.
- Explicit user consent metadata for sharing and media.
- Notification retry deduplication and quiet-hour respect.
- Separate LLM copy generation from safety/eligibility rule enforcement.
- Log why an alternative was offered; allow correction/reversion.
- Handle offline updates and reconnect without duplicate completion.
- Ability to review pilot metrics without leaking private conversations.

## 10. Privacy, safety and trust requirements

1. No diagnosis or treatment recommendation by Sukhi.
2. No prescription changes, dosage suggestions or “make up a missed dose” instructions.
3. If medication reminders are included, use the user's prescribed schedule and self-reported confirmation only.
4. Movement/nutrition alternatives must remain inside the user's established constraints; if uncertain, ask rather than improvise.
5. New/severe symptoms require a clinician-reviewed escalation route, with emergency information appropriate to location and context.
6. Private conversations are not automatically visible to family. Share only agreed summaries.
7. Consent is granular, plain-language and revocable; do not treat family payment as blanket access permission.
8. Recording and image uploads need clear permission, retention rules and deletion controls.
9. Data minimisation and secure storage are mandatory. Local legal/privacy obligations require qualified counsel's review before launch.
10. Accessibility and user dignity are product safety properties, not decorative preferences.

## 11. MVP prioritisation and scope

| Tier | Deliverables | Rationale |
|---|---|---|
| **P0 — functional MVP** | Auth/basic onboarding; language choice; 2–3 daily actions; Today card; I did it/Later/Skip; text or voice check-in; scheduled reminders; simple rules-first restart; basic weekly view; safety boundaries | Prove the behaviour loop |
| **P1 — early pilot engagement** | Optional photo/voice notes; streaks/milestones; improved personalised nudges; parent-controlled family summary; lightweight visual garden | Test what draws repeat engagement |
| **P2 — later intelligence and scale** | Richer barrier detection, multilingual code-switching, timing optimisation, co-op activities, advanced family features and extra channels | Requires real pilot data, quality and safety evaluation |

The business decks propose a narrow MVP, then **10–20-family pilot for 2–4 weeks**; these figures are planning hypotheses, not efficacy evidence. Medication scope is undecided in the deck: decide “reminders only” versus “out of MVP” before implementation.

## 12. Measurement and pilot evaluation

| Metric | Definition / use |
|---|---|
| Daily check-in rate | Share of eligible users sending a check-in that day |
| Action completion | Completed self-reports / planned eligible actions (clearly define denominator) |
| Recovery after lapse | Return-to-activity rate after a missed/unanswered scheduled action |
| Week-over-week retention | Users returning in subsequent weeks |
| Speech task success | Correct check-in outcome via voice without helper intervention |
| Regional language accuracy | Recognition/comprehension including older Marathi and code-switching |
| Nudge acceptance | User response to suggested smaller/time-shifted options |
| Trust and usability | Comprehension, emotional tone, task success, perceived control |
| Family value | Engagement with consented summaries and willingness-to-pay interviews |
| Safety events | Incorrect advice, unsafe alternative, privacy breach, escalations |

**North-star evaluation:** sustained action and gentle restart after interruption, not downloads, notifications sent, or rewards issued.

## 13. Final developer checklist

- [ ] Apply the final sky-blue, teal, white and navy token system.
- [ ] Prepare responsive landing page and header.
- [ ] Use approved hero wording and reviewed translations.
- [ ] Implement the four-step How Sukhi Works section.
- [ ] Implement Why Sukhi, domains, languages, CTA, footer and disclaimer.
- [ ] Build Today / Assistant / My Plan / Progress / Settings navigation.
- [ ] Build accessible activity cards with **I did it / Later / Skip**.
- [ ] Define separate completed, rescheduled, skipped, missed and no-response states.
- [ ] Implement optional photo / voice-note / text sharing, with user confirmation.
- [ ] Implement the rules-first Gentle Restart Loop, with safe alternatives only.
- [ ] Build transparent weekly progress and optional streaks/milestones.
- [ ] Implement language preferences, microphone states, text fallback and locale QA.
- [ ] Add consent-based family summaries only when pilot scope is agreed.
- [ ] Implement recording consent, privacy controls, data minimisation and deletion.
- [ ] Have safety copy and escalation triggers reviewed by qualified clinicians.
- [ ] Remove all unsupported numeric longevity and health-outcome claims.
- [ ] Test with older users for readability, touch accuracy, trust and voice recognition.
- [ ] Verify each screen at desktop and mobile widths, with long translations.

## 14. Decisions still requiring owner sign-off

These are not implied to be resolved by the design mockup:

1. **MVP medication feature:** reminders only, or defer altogether?
2. **Language launch promise:** Marathi-first versus validated simultaneous English/Hindi/Marathi release.
3. **Family view:** limited pilot release or later phase? Exact permissions and alert thresholds.
4. **Clinical red flags:** symptom list, wording, escalation path and qualified reviewer.
5. **Photo processing:** storage and user confirmation approach; do not treat image as automatic proof.
6. **Rewards:** streak/points versus optional simple garden; keep light.
7. **Operational acceptance thresholds:** voice task success, retention, restart and notification response targets are to be set after baseline testing.
8. **Vector assets:** final Sukhi logo/hero illustration must be supplied or approved by a designer.

## 15. Sources and provenance

**Project source material supplied:**
- *Sukhi 60 — Business Deck* (October 2026): problem, audience, core loop, product categories, pilot logic and differentiation hypothesis.
- *Sukhi 60 — Business Deck v2* (October 2026): voice-first app, parent and family views, initial adaptation rules, India context and privacy/safety open questions.
- *MVP Recommendation Analysis* (project text): product strategy discussion. This current handoff retains the prior wellbeing-app specification rather than adopting an unapproved later care-plan pivot.
- *The Behaviour Change Wheel: A new method for characterising and designing behaviour change interventions*, Susan Michie, Maartje M. van Stralen, Robert West, *Implementation Science* 2011, 6:42, DOI: `10.1186/1748-5908-6-42` (COM-B basis).
- Final sky-blue Sukhi reference screenshot and preceding approved website/branding discussion.

**Design/implementation proposals versus evidence:** Hex codes, component measurements, example copy, backend schema and rollout tiers are **implementation recommendations** agreed as the handoff direction, not measured effects or native current backend details. COM-B informs how to investigate barriers but does not establish that a specific Sukhi feature works. The supplied business decks contain hypotheses to validate; they are not clinical outcome studies.

---

**Final build principle:** **Less decoration. More clarity. More focus on the user's next achievable action.**  
**Brand promise:** **Your health in your own hands. Life happens. Sukhi adapts.**
