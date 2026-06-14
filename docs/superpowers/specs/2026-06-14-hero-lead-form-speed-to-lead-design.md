# Hero Lead-Form + Speed-to-Lead SMS — Design

**Status:** Approved in brainstorming — 2026-06-14
**Branch:** `feat/hero-lead-form` (off `main`)

**Goal:** Add a hero **lead-capture form** (name · phone · need) to the R1 premium landing that, on submit, creates a CRM contact, instantly **texts the lead a booking link** (speed-to-lead) via the workspace's Twilio (graceful no-op when none), **emails the operator**, and emits `form.submitted`. Platform feature — every R1 workspace (the demos + all future real clients) gets it.

## Why
Seldon Studio's promise is "an AI front office that captures every lead instantly." Today the R1 hero has only Call + Book buttons — no capture form. This adds the speed-to-lead capture mechanism (inspired by the Platinum Plumbing "Schedule Your Service" hero form), making the promise tangible on every landing.

## Approved decisions
- **Layout:** lead-form card on the **right side** of the hero (headline / subhead / trust + secondary **Call + Book** on the left) — the proven Platinum-style high-converting layout, across all 3 hero variants.
- **Visual quality:** **world-class / Claude-Design grade.** The card adapts to the workspace's aesthetic **archetype** (palette, fonts, radius) — elevated white-or-tinted surface, generous spacing, clear field hierarchy, a bold full-width primary CTA, star/trust row, and a TCPA microcopy line. It must look bespoke per vertical (bold-urgency red for trades, clinical-trust blue for clinics, editorial-warm for the med spa), never like a generic embedded form.
- **Operator alert:** yes — email the operator on every lead.
- **Demo SMS:** build it correctly (sends via the workspace's Twilio for real clients); the 9 demos **capture + show an instant on-screen confirm**, with live text-back switching on once a number + A2P are attached. No A2P dependency to ship.

## Architecture
Built on `main` (the R1 landing system). Reuses existing primitives — no parallel infra:
- Contact find-or-create pattern from the **public intake route** (`app/api/v1/public/intake/route.ts`).
- `sendSmsFromApi` (`lib/sms/api.ts`) for the lead SMS (suppression/STOP already handled there; **throws when no Twilio → must be wrapped**).
- `buildWorkspaceUrls(slug, baseDomain, orgId).book` (`lib/billing/anonymous-workspace.ts`) for the `/book` link.
- `emitSeldonEvent` for `contact.created` + `form.submitted` (the latter is the seam to any configured speed-to-lead agent).
- Existing ops-notification email path for the operator alert.

## Components

### 1. Payload field — `leadForm` on the hero
Add an optional field to `R1HeroSection` (`lib/landing/r1-payload-prompt.ts:30`) **and** `HeroProps` (`components/landing-r1/sections/hero.tsx:25`):
```ts
leadForm?: {
  enabled: boolean;
  heading?: string;        // e.g. "Get a fast callback"
  needLabel?: string;      // e.g. "What do you need?"
  needOptions?: string[];  // optional <select> options; free text if omitted
  consentText?: string;    // short TCPA line under the button
};
```
Round-trips through `loadLandingPayload` (raw passthrough — no loader/whitelist change). Enabled per workspace by setting `blueprint_json.payload.hero.leadForm` in the DB.

### 2. Hero lead-form — `components/landing-r1/sections/hero-lead-form.tsx` (`"use client"`)
Child of `<Hero>`, rendered only when `leadForm.enabled`. Compact card (Platinum-style): **Name**, **Phone**, **"What do you need?"** (select from `needOptions`, else short text), submit button (default "Get a fast callback"), consent line under the button. `useTransition` + success state; imports `submitLeadFormAction` directly (mirrors `components/bookings/public-booking-form.tsx`). Props: `orgSlug`, `businessName`, `leadForm` config, `archetype` (for theming). **Placement: the right column of the hero** (where the hero image/overlay sits today), across all 3 hero variants (`HeroSplit`, `HeroLeftAsymmetric`, `HeroCinematic`); Call + Book stay as secondary CTAs on the left. Styled per the archetype's CSS vars (`--primary`, `--font-headline`, radius) so it's world-class + on-brand, not a generic form. On mobile it stacks below the headline.

### 3. Server action — `lib/landing/lead-form-action.ts` (`"use server"`)
`submitLeadFormAction({ orgSlug, name, phone, need }): Promise<{ ok: boolean; smsSent: boolean; bookUrl: string }>` — mirrors the public intake route:
1. Resolve org by slug; `assertWritable()`; `enforceContactLimit(orgId)`.
2. Idempotency guard (dedup by `orgId+phone` within a short window — copy intake route's pattern).
3. **Find-or-create contact by phone** (`findContactByPhone`, `lib/sms/api.ts:314`): `status:"lead"`, `source:"landing-hero"`, `need` → `customFields`; backfill name only if blank (never clobber).
4. Emit `contact.created` (on create) + `form.submitted` (always).
5. Build book URL via `buildWorkspaceUrls`.
6. **Lead SMS (graceful):** `try { await sendSmsFromApi({ orgId, userId: null, contactId, toNumber: phone, body }) } catch { /* no Twilio / provider error → skip */ }`. Body: `Hi ${name}, thanks for reaching out to ${business}! Grab a time here: ${bookUrl} — or just reply and we'll get you booked.` Set `smsSent` from the result (`false` if skipped/suppressed).
7. **Operator email:** "New lead — {name} · {phone} · {need}" to the operator, via the existing ops-notification email path (no Twilio dependency).
8. Return `{ ok, smsSent, bookUrl }`.

### 4. Wiring
- Pass `leadForm` + `orgSlug` to the hero in both R1 pages: `app/(public)/w/[slug]/page.tsx:132` and `app/(public)/s/[orgSlug]/[...slug]/page.tsx:133`.
- Enable on the 8 R1 demos via DB (`payload.hero.leadForm.enabled = true`). **Lumière** (med-spa template renderer) is excluded.

## Data flow
visitor submits → `submitLeadFormAction` → (contact upsert + `contact.created`/`form.submitted`) + (lead SMS via workspace Twilio **or** graceful skip) + (operator email) → returns confirm → card flips to **"✓ Got it, {name} — we just texted you a booking link"** (or, when no SMS went out, **"✓ Got it — book instantly:"** + a Book button).

## Error handling / edge cases
- **No Twilio (demos):** SMS try/catch → skip; contact + operator email + on-screen confirm still succeed. Confirm copy adapts (omits "we texted you").
- **Suppressed / STOP number:** `sendSmsFromApi` returns `suppressed` (no throw) → `smsSent:false`.
- **Free-tier contact cap:** `enforceContactLimit` throws → form shows a friendly error, no crash.
- **Duplicate/retry:** idempotency guard prevents double contact + double SMS.
- **No email in form:** find-or-create by **phone**.
- **Template-rendered landings (Lumière med-spa):** render via `PageRenderer`, not the R1 `<Hero>` → form not shown. Out of scope (separate template work).
- **Public submit has no auth/CSRF by design:** replicate the intake route's `assertWritable` + `enforceContactLimit` + idempotency; no new auth needed.

## Testing
- **Unit (`submitLeadFormAction`, node:test/tsx):** create new contact; upsert existing-by-phone (backfill, no clobber); emits `contact.created`+`form.submitted`; SMS skipped gracefully when no Twilio; suppressed number → `smsSent:false`; contact-limit error surfaced. Mock the SMS + db boundaries.
- **Component:** `hero-lead-form` success and error states render correctly.
- **Manual:** a demo (capture + confirm, no SMS) + a workspace with Twilio configured (real SMS received).

## Out of scope (this spec)
- **Phase 2B** — per-site branding variety ("4 designs").
- Lead form on template-rendered landings (Lumière).
- A2P approval / per-demo number provisioning (operational — enables live *demo* SMS later).
- Chatbot / booking changes (already working).
