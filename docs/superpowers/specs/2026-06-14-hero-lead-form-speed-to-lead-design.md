# Speed-to-Lead Conversion Engine — Design

**Status:** Approved in brainstorming — 2026-06-14
**Branch:** `feat/hero-lead-form` (off `main`)
*(Filename kept for history; per review the lead form is a **bottom section**, not a hero card.)*

**Goal:** Add to the R1 landing framework: (1) a **bottom lead-capture section** (name · phone · need) that creates a CRM contact, **texts the lead** a booking link (graceful when no Twilio) and **emails the operator**; (2) a working mobile sticky **"Text"** button (`sms:` to the business number); plus wire the **9 demos' Call + Text to the Seldon Studio 839 AI line**. Platform feature (every R1 workspace) + demo configuration.

## Why
Seldon Studio's promise is "an AI front office that captures every lead instantly." The landing has no lead form and a dead Text button today. This adds both capture paths and makes the demos a true "call/text it live" experience.

## Approved decisions
- **Lead form = a dedicated section near the bottom** of the page (before the footer). The hero stays photo + headline + Call/Book.
- **World-class, archetype-themed** styling (palette/fonts/radius from the workspace archetype).
- **Email the operator** on every lead.
- **Demos:** the lead form captures + shows an instant on-screen confirm now (the outbound "we text you back" turns on with A2P). Demos' **Call + Text wired to the 839 line** — voice answers now, inbound text captured now, AI text-back at A2P. Demos display the 839 number.

## Components

### 1. Payload field — `leadForm` (top-level)
Add an optional field to `R1LandingPayload` (`lib/landing/r1-payload-prompt.ts`):
```ts
leadForm?: {
  enabled: boolean;
  heading?: string;       // "Get a fast callback"
  subheading?: string;    // "Tell us what you need — we'll text you a time in minutes."
  needLabel?: string;     // "What do you need?"
  needOptions?: string[]; // optional <select> options; free text if omitted
  consentText?: string;   // TCPA line
};
```
Round-trips via `loadLandingPayload` (raw passthrough — no loader change). Enabled per workspace by setting `blueprint_json.payload.leadForm` in the DB.

### 2. Lead-form section — `components/landing-r1/sections/lead-form.tsx` (`"use client"`)
A full-width section, archetype-themed (palette/fonts/radius via the archetype CSS vars) so it's world-class + on-brand per vertical. Centered card: heading, subheading, **Name · Phone · "What do you need?"** (select from `needOptions`, else short text), a bold primary submit, a star/trust line, and a TCPA consent line. `useTransition` + success state — flips to **"✓ Got it, {name} — we just texted you a booking link"** (or **"✓ Got it — book instantly:"** + a Book button when no SMS went out). Imports `submitLeadFormAction` directly (mirrors `components/bookings/public-booking-form.tsx`). Props: `orgSlug`, `businessName`, `archetype`, `leadForm` config.

### 3. Server action — `lib/landing/lead-form-action.ts` (`"use server"`)
`submitLeadFormAction({ orgSlug, name, phone, need }): Promise<{ ok; smsSent; bookUrl }>` — mirrors the public intake route:
1. resolve org by slug; `assertWritable()`; `enforceContactLimit(orgId)`.
2. idempotency guard (dedup by `orgId+phone`, short window).
3. **find-or-create contact by phone** (`findContactByPhone`): `status:"lead"`, `source:"landing-leadform"`, `need` → `customFields`; backfill name only if blank.
4. emit `contact.created` (on create) + `form.submitted` (always).
5. build book URL (`buildWorkspaceUrls`).
6. **text the lead** via `sendSmsFromApi`, wrapped in try/catch (graceful skip when no Twilio): `Hi ${name}, thanks for reaching out to ${business}! Grab a time here: ${bookUrl} — or reply and we'll get you booked.` Set `smsSent` from the result.
7. **email the operator** ("New lead — {name} · {phone} · {need}") via the existing ops-notification email path (no Twilio dependency).
8. return `{ ok, smsSent, bookUrl }`.

### 4. Mobile sticky "Text" button
`StickyMobileBar` renders Call/Text/Book from `payload.sticky` (`callHref` / `smsHref` / `bookHref`). Today `smsHref` is empty → Text is dead. Fix:
- In the R1 generator (where `sticky` is assembled), set `smsHref = "sms:" + E.164(phone)` (+ optional `?&body=` starter) so new builds ship a working Text button.
- Backfill `payload.sticky.smsHref` on existing R1 workspaces.
- `StickyMobileBar` renders the Text button **only when `smsHref` is present** (hide otherwise — confirm/adjust the component).

### 5. Demo telephony → 839 (data backfill)
For the 9 demos, set the **839 line** as the phone across the payload — Call CTAs (`tel:839`), `footer.phone`, `sticky.callHref`/`smsHref`, and the displayed number — so Call (voice AI, works now) + Text (capture now, reply at A2P) reach the live line. Same Neon backfill approach used for the images. *(Lumière renders via the med-spa template — wire its CTAs separately or leave for the template pass; note it.)*

### 6. Wiring
- Render `<LeadFormSection>` in both R1 pages (`(public)/w/[slug]/page.tsx`, `(public)/s/[orgSlug]/[...slug]/page.tsx`) **after `<Faq>`, before `<Footer>`**, when `payload.leadForm.enabled`. Pass `orgSlug`, `businessName`, `archetype`.
- Enable `leadForm` on the 8 R1 demos (DB). Lumière excluded (template renderer).

## Data flow
- **Lead form:** submit → `submitLeadFormAction` → contact + `contact.created`/`form.submitted` + (lead SMS via workspace Twilio | graceful skip) + operator email → confirm card flips.
- **Sticky Text:** tap → opens the visitor's Messages app to `smsHref` (business / 839 line) → inbound received (no A2P) → AI reply (needs A2P) or manual.

## Error handling / edge cases
- **No Twilio (demos):** lead SMS try/catch → skip; contact + operator email + on-screen confirm still succeed; confirm copy adapts.
- **Suppressed / STOP:** `sendSmsFromApi` returns `suppressed` (no throw) → `smsSent:false`.
- **Free-tier contact cap:** `enforceContactLimit` throws → friendly form error.
- **Idempotency:** guard prevents double contact + double SMS on retries.
- **No email in form:** find-or-create by phone.
- **Inbound SMS needs no A2P; outbound (text-back) does** — demos: Text captures now, AI replies once A2P clears.
- **Template-rendered Lumière (med-spa):** renders via `PageRenderer`, not the R1 sections / `StickyMobileBar` → no lead-form section / sticky Text there. Out of scope (separate template work).
- **Public submit has no auth/CSRF by design:** replicate the intake route's `assertWritable` + `enforceContactLimit` + idempotency.

## Testing
- **Unit (`submitLeadFormAction`, node:test/tsx):** create new contact; upsert existing-by-phone (backfill, no clobber); emits `contact.created`+`form.submitted`; SMS graceful-skip when no Twilio; suppressed → `smsSent:false`; contact-limit error surfaced. Mock SMS + db boundaries.
- **Component:** lead-form section success/error states; `StickyMobileBar` renders Text only when `smsHref` present.
- **Manual:** a demo (capture+confirm; Text → 839) + a Twilio-configured workspace (real lead SMS received).

## Out of scope
- **Phase 2B** — per-site branding variety ("4 designs").
- Lead form / sticky Text on template-rendered landings (Lumière).
- A2P approval / number provisioning (operational — enables outbound text-back).
- Chatbot / booking / voice changes (already working).
