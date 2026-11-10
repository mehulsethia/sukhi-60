# WhatsApp setup (official Meta WhatsApp Cloud API)

Sukhi uses only the official Cloud API: authenticated HTTPS to `graph.facebook.com` and HMAC-signed webhooks. There is no QR-session automation, browser scraping or unofficial transport. When WhatsApp is not configured, the web app works on its own and Settings shows "WhatsApp isn't configured".

Status as of 2026-11-10: **code complete and fixture-tested. No Meta app, number, token, template or real message exchange exists yet.** Nothing below has been approved by Meta.

Meta's UI changes often. Check each step against developers.facebook.com/docs/whatsapp/cloud-api (Get started, Webhooks, Message templates, Pricing, Policy) while you do it.

---

## 1. Meta developer app, business portfolio, WABA, phone number
1. Go to developers.facebook.com → **My Apps → Create App**. Choose the use case **"Connect with customers through WhatsApp"**, then select or create a **business portfolio** you control.
2. **WhatsApp → API Setup** creates or attaches a WhatsApp Business Account (WABA) and gives you a **test phone number**. Record the **WABA ID** and **Phone number ID**. The Phone number ID goes into `WHATSAPP_PHONE_NUMBER_ID`.
3. For production you also need a phone number you own that is **not** registered in the consumer or Business WhatsApp app (or that you migrate), plus a display name that Meta reviews.

## 2. Test number, test recipients, first exchange
1. In **API Setup → To**, add your own phone as a test recipient and confirm it with the code WhatsApp sends. Meta allows only a small number of test recipients on the test number (currently documented as up to 5; check the page).
2. Click **Send message** to receive the `hello_world` template.
3. **Reply from your phone.** This opens the 24-hour customer service window for that number, during which free-form replies are allowed.

## 3. Production sender, tokens, permissions, billing, verification
- **Temporary token** (API Setup → Generate access token): expires quickly. Use it only for the first test.
- **Permanent token:** Business Settings → **System users** → add a system user → assign the app (Manage app) and the WABA (Full control) → **Generate token** with `whatsapp_business_messaging` and `whatsapp_business_management` (Meta's guide also lists `business_management`). Store it as `WHATSAPP_ACCESS_TOKEN` (secret).
- **Rotation:** generate a new system user token, update it in Vercel (`vercel env add WHATSAPP_ACCESS_TOKEN production`), redeploy, then revoke the old token in Business Settings.
- **Billing:** add a payment method to the WABA in Business Settings or WhatsApp Manager. Template messages (used outside the 24h window) are charged per Meta's current pricing. Replies inside the window are handled under Meta's current service-conversation rules, so check the pricing page.
- **Business verification and display name approval** may be required to raise limits or go live. Meta decides this and Sukhi cannot complete it for you.

## 4. Webhook: URL, verify token, app secret, subscription, signatures
- **Callback URL:** `https://<your-domain>/api/whatsapp/webhook` (for example `https://sukhi-60.vercel.app/api/whatsapp/webhook`). This route is public by design and authenticates every request itself.
- **Verify token:** any random string of at least 16 characters (`openssl rand -hex 16`). Put the same value in `WHATSAPP_VERIFY_TOKEN`. Meta's GET handshake (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`) is answered only when the token matches; otherwise the route returns 403.
- **App secret:** App settings → Basic → App secret goes into `WHATSAPP_APP_SECRET`. Every POST is checked against `X-Hub-Signature-256` (HMAC-SHA256 of the **raw** body) before anything is stored. Invalid signatures get 401 and nothing is persisted.
- **Subscription:** in WhatsApp → Configuration → Webhook fields, subscribe to **`messages`**. This field carries inbound messages and delivery statuses.
- Sequence: deploy with the env vars set, then click **Verify and save** in Meta.
- **Processing model:** the webhook validates the request, stores the event (deduplicated by Meta message id), enqueues a durable job and returns 200. It then processes that job immediately via `after()`. If that attempt fails, the Supabase Cron worker retries within about a minute. Expected reply latency: usually a few seconds, worst case about 1–2 minutes plus model latency.

## 5. Templates to submit (all PROPOSED — not approved)
Templates are only needed for messages sent **outside** the 24-hour window. Bodies contain no diagnosis, medicine names or health details, so they are safe to show on a lock screen.

| Name | Category | Languages | Variables | Body (en / hi / mr) |
|---|---|---|---|---|
| `sukhi_checkin_ready` | UTILITY | en, hi, mr | none | "Your Sukhi check-in is ready. Reply to continue." / "आपका सुखी चेक-इन तैयार है। जारी रखने के लिए जवाब दें।" / "तुमचे सुखी चेक-इन तयार आहे. पुढे जाण्यासाठी उत्तर द्या." |
| `sukhi_link_confirmed` | UTILITY | en, hi, mr | none | "Your WhatsApp is now connected to Sukhi. Reply STOP at any time to stop messages." (+ hi/mr in `src/domain/whatsapp.ts`) |

Submit them in WhatsApp Manager → Message templates. Meta assigns or may change the category. **After approval**, set `WHATSAPP_APPROVED_TEMPLATES=sukhi_checkin_ready` (comma list) and `WHATSAPP_TEMPLATE_LANGUAGES=en,hi,mr` (only the languages approved), then redeploy. Until a template is listed there, the app never attempts out-of-window proactive messages. Those reminders stay in-app only.

The template source of truth is `PROPOSED_TEMPLATES` in `src/domain/whatsapp.ts`, and `decideSend()` enforces the window rule.

## 6. Environment variables (Vercel → Project → Settings → Environment Variables)
| Variable | Secret? | Value |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | yes | system user token |
| `WHATSAPP_PHONE_NUMBER_ID` | no | digits from API Setup |
| `WHATSAPP_APP_SECRET` | yes | App settings → Basic |
| `WHATSAPP_VERIFY_TOKEN` | yes | your random string |
| `WHATSAPP_GRAPH_VERSION` | no | `v26.0` (current at build time) |
| `WHATSAPP_APPROVED_TEMPLATES` | no | empty until approved |
| `WHATSAPP_TEMPLATE_LANGUAGES` | no | e.g. `en,hi,mr` |

`WHATSAPP_GRAPH_BASE_URL` is used only for local tests and is ignored unless it is a loopback URL. Never set it in production. Run `pnpm check:config` to confirm set / missing / invalid status without printing values.

## 7. Link a patient account, then test inbound text, image and audio
1. In the web app: **Settings → WhatsApp → Create link code**. It shows `SUKHI-XXXXXXXX`, valid for 15 minutes and usable once. Only a peppered hash is stored.
2. From the patient's WhatsApp, send that exact text to the business number. The binding is proven by the message coming *from* that account. A typed phone number never links an account.
   - A number already linked to another account is refused (no takeover). Switching numbers needs a "switch number" code. Replayed or expired codes fail, and 5 failures per hour per number trigger a block.
3. Expected reply: "Connected! …". Settings shows **Connected** with the time of the last message.
4. Then test:
   - **Text:** send "done" while an action is due. It shows as *Done (your report)* on Today, and the conversation appears in the web Assistant labelled "via WhatsApp".
   - **Image:** send a photo. It is attached to the most relevant open (or just-completed) action, and the reply describes what is visible and what it cannot confirm.
   - **Audio:** send a voice note. It needs Sarvam configured and the voice permission enabled. It is transcribed ("I heard: …") and then handled like text. Raw audio is not stored.

## 8. Outbound checks
- **Inside the window** (you messaged in the last 24h): a due reminder sends free text, e.g. "Time for: Evening walk. Reply done, later, skip, or unwell."
- **Outside the window:** with no approved template, nothing is sent to WhatsApp (in-app reminder only). With `sukhi_checkin_ready` approved and configured, that template is sent.
- **STOP:** reply `STOP` (also `बंद करो`, `थांबवा`). The binding is paused, WhatsApp consent is revoked, one confirmation is sent, and no further messages follow. `START` resumes, and `PAUSE` pauses without revoking consent.
- **Replay:** Meta may redeliver webhooks. Events are deduplicated by message id, so check-ins and replies are not repeated.
- **Delivery failures:** `pnpm jobs:health` lists failed and **uncertain** sends. An uncertain send (a timeout after the request may have reached Meta) is **never automatically resent**. Review it, then decide. Delivery status webhooks update `outbound_messages.status`.

## 9. Platform approval and AI-service considerations
- Meta's WhatsApp Business Solution terms include an "AI providers" section (in effect from 15 Jan 2026, per public reporting). It bars providers from distributing **general-purpose** AI assistants over the Business API, while businesses using AI for their own service remain allowed. Sukhi is a narrow care-routine companion with fixed tools, but **that label does not guarantee approval**. Read the current Business Solution Terms and Commerce/Business Messaging policies, and be ready to describe the use case to Meta.
- Health-related messaging may receive extra scrutiny. Keep templates generic, keep opt-in records (Sukhi stores consent and binding timestamps), and honour STOP immediately.

## 10. Who does what
**You must do these in Meta's UI or with your accounts:** create the app, business portfolio and WABA; add test recipients; create the system user token; add billing; complete business verification and display name review if required; set the webhook URL, verify token and `messages` subscription; submit the templates and wait for approval; run real-device tests with opted-in testers.

**Done in code and verified with fixtures (not real Meta):**
- GET verification and raw-body HMAC validation
- Durable deduplicated ingestion and delivery status handling
- One-time link codes, with replay, expiry, takeover and rate-limit tests
- STOP/START/PAUSE handling
- 24h window rule with template-only fallback
- Uncertain-delivery handling
- Trusted-host and size-limited media fetch
- Shared agent and context across web and WhatsApp

Evidence: `tests/unit/whatsapp-rewards.test.ts`, `tests/integration/whatsapp.test.ts`, `tests/integration/jobs-linking-family.test.ts`, `tests/e2e/journey.spec.ts` (local Graph API mock).

**Not done:** any real message through Meta, template approval, business verification.
