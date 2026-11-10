# Licence notes

## Summary

Sukhi 60 contains **no source code, assets or text copied** from the four reference repositories. Everything in `sukhi-60/` was written independently from the product brief. The references were read for domain understanding only. As a result:

- No AGPL-3.0 obligations come from OpenCare or HabitTrove. Their code was not incorporated, modified or linked.
- No MIT attribution is legally required for ai-health-assistant or PACT, because none of their code was copied. They are credited below anyway for transparency.
- Sukhi's own licence is **not yet chosen**. The owner must pick one before publishing the repository. Nothing in this tree prevents a proprietary or permissive licence.

## Reference licences (verified from local files)

| Repository | Licence file | Licence | Used as |
|---|---|---|---|
| OpenCare @ 4c462f9 | `OpenCare/licence.md` | GNU AGPL-3.0 | Conceptual reference (occurrence generation pattern, intake confirmation idea) |
| HabitTrove @ 5144d61 | `HabitTrove/LICENSE` | GNU AGPL-3.0 | Conceptual reference (visible progress, optional personal reward) |
| ai-health-assistant @ b1320ad | `ai-health-assistant/LICENSE` | MIT (© 2023 Mediar, Inc.) | Conceptual reference (multi-channel assistant; patterns to avoid) |
| PACT @ b044cbd | `PACT/LICENSE` | MIT (© 2026 Karthik) | Conceptual reference ("uncertain" verdict, structured criteria) |

## Rules for future contributors

1. Do not paste code from OpenCare or HabitTrove into this repository unless the whole project is intended to be released under AGPL-3.0 and the owner agrees.
2. If MIT-licensed code from ai-health-assistant or PACT is ever copied, keep its copyright notice and licence text in a `THIRD_PARTY_NOTICES` file.
3. Non-code assets (images, icons, screenshots such as `PACT/pact-design.png`) were not copied. The app icon is generated in code (`src/app/icons/[size]/route.tsx`).

## Third-party runtime dependencies

These are installed from npm under their own licences (mostly MIT, Apache-2.0 or ISC), including Next.js, React, `@supabase/*`, `ai`/`@ai-sdk/anthropic`, `next-intl`, `zod`, `date-fns(-tz)`, `lucide-react` and Tailwind CSS. Run `pnpm licenses list` for the full list before distribution. The fonts (Noto Sans, Noto Sans Devanagari) are loaded through `next/font/google` under the SIL Open Font License.

External services (Anthropic API, Sarvam AI, Meta WhatsApp Cloud API, Supabase, Vercel) are used under their own terms of service, which the operator must accept.
