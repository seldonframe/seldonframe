# Client PWA — Branded Contractor App (v1) — Design

**Status:** Approved in brainstorming — 2026-06-14
**Branch:** `feat/client-pwa` (off `main`)

**Goal:** Ship a v1 **installable, agency-branded, mobile-first app** for an agency's clients (contractors/plumbers/HVAC owners) — a LeadConnector-style **Today / Leads / Messages / Appointments** app — by **reusing** the existing operator-portal auth, workspace-scoped data, and agency branding, and **adding** a PWA shell (dynamic manifest + PNG icons + service worker). Web-push and a call-log screen are deferred to a fast-follow.

## Why
Seldon Studio's clients want what GoHighLevel agencies give theirs: a branded app on their phone/laptop showing today's leads, appointments, and texts — the "my business in my pocket" moment. The backend already exists; v1 is the mobile UI + the installable shell.

## Approved decisions
- **v1 screens:** Today · Leads · Messages · Appointments.
- **Web-push:** fast-follow (NOT v1).
- **Shell:** purpose-built mobile-first (not a shrunk desktop CRM); the full CRM stays reachable.
- **Per-agency branded** (manifest + app chrome).
- **PWA, not native** (installable on phone + laptop; no app store).

## What's reused (no rebuild — verified in the audit)
- **Auth:** the **operator portal** magic-link (`lib/operator-portal/auth.ts`, `/portal/[slug]/login` → `/portal/[slug]/magic`). The contractor logs in by email; `sf_operator_session` cookie scopes everything to their workspace. No new auth.
- **Data:** every query (contacts/leads, bookings, conversations/SMS, deals) auto-scopes via `getOrgId()` for the operator session. **Zero data-layer changes.** `OperatorTodaySnapshot` (`components/dashboard/operator-today-snapshot.tsx`) already computes today's bookings/week/unread-messages.
- **Branding:** `getEffectiveBrandingForWorkspace(orgId)` (`lib/partner-agencies/branding.ts`) returns `brand_name`, `primary_color`, `accent_color`, `logo_url`, `is_white_label`. Drives the manifest + theme.
- **Manifest helper:** `generatePwaManifest()` in `@seldonframe/core/virality` (currently hardcoded — to be made dynamic).

## Components (what v1 builds)

### 1. Mobile app shell — `app/portal/[slug]/(operator)/`
Today this group just `redirect("/dashboard")` (the dense desktop CRM). Replace that with a **mobile-first shell**: a fixed **bottom-tab nav** (Today · Leads · Messages · Appts) mirroring the customer-portal mobile pattern (`components/customer-portal/customer-portal-nav.tsx`), light-mode, `min-h-[100dvh]`, agency-branded header (logo + brand name). Responsive: wider/centered on desktop. The full CRM pages (`/portal/[slug]/contacts`, `/bookings`, …) remain reachable via a "More" affordance.
- New: `app/portal/[slug]/(operator)/layout.tsx` (shell + bottom-tab nav + branding), and the 4 screen routes below. `requireOperatorSessionForOrg(slug)` already guards the group.

### 2. Today screen — `(operator)/page.tsx`
Glance cards: **New leads** (contacts `status='lead'` created in last 7d) · **Today's appointments** (bookings today) · **Unread texts** (unread inbound SMS) · **Missed calls** (placeholder/"coming soon" — no call data surfaced yet) + a short recent-activity list. Reuse `OperatorTodaySnapshot` queries; add the "new leads" + "unread texts" counts (small workspace-scoped queries).

### 3. Leads screen — `(operator)/leads/page.tsx`
Mobile card list of contacts (name, phone, status, source, time) + a lead detail (drawer/route) with **tap-to-call** (`tel:`) and **tap-to-text** (`sms:`). Reuse the contacts query (`listContacts()` / `ContactsListPageView` data) in a mobile layout.

### 4. Messages screen — `(operator)/messages/page.tsx`
SMS inbox: threads grouped by contact (latest message + unread badge) → thread view. Reuse the `/conversations` data (`smsMessages` scoped by `getOrgId()`). v1 read-focused; reply can reuse the existing send action if cheap, else fast-follow.

### 5. Appointments screen — `(operator)/appointments/page.tsx`
Mobile list of upcoming bookings (date/time, customer, service) grouped by day. Reuse `listBookings()`.

### 6. Dynamic per-agency manifest — `app/portal/[slug]/manifest.webmanifest/route.ts`
A `GET` route handler: resolve the workspace by `slug` → `getEffectiveBrandingForWorkspace(orgId)` → return a manifest with `name`/`short_name` = brand name, `theme_color`/`background_color` from branding, `start_url` + `scope` = `/portal/[slug]/`, `display: "standalone"`, and `icons` (see §7). Linked from the `(operator)` layout via `export const metadata = { manifest: ".../manifest.webmanifest" }` or a `<link rel="manifest">`. Falls back to SeldonFrame defaults when no active agency.

### 7. Icons — PNG 192 + 512 (+ maskable, apple-touch-icon)
v1: if the agency `logo_url` is a usable square raster, use it; otherwise ship a default SeldonFrame PNG icon set in `public/` (the helper references `/icon-192.png` + `/icon-512.png` which **don't exist today** — add them). Per-agency name + theme_color apply regardless. (Per-agency *generated* icons = fast-follow.)

### 8. Service worker — installability + offline shell
Add **serwist** (`@serwist/next`) with an `app/sw.ts` + `next.config` wrapper: precache the app shell, serve an offline fallback. This is what enables the Android/desktop **install prompt** (manifest + SW). iOS uses Add-to-Home-Screen (manifest + `apple-mobile-web-app-*` meta + apple-touch-icon — no SW needed there).

### 9. Install affordance
An "Install app" button/banner in the shell: capture `beforeinstallprompt` (Android/desktop) → prompt; on iOS, show a one-line "Add to Home Screen" hint.

## Access / gating
The operator portal is gated to **Scale-tier or agency-attached** workspaces. Real contractors under Seldon Studio's partner agency qualify. **Prerequisite:** attach the 9 demo workspaces to the Seldon Studio partner agency (`attach_workspace_to_agency`) — this both unlocks the portal/PWA for them **and** brands their app as Seldon Studio.

## Data flow
Install PWA → open → `/portal/[slug]` → (no session) magic-link login → **mobile shell (Today)** → bottom-tabs to Leads / Messages / Appts. All data workspace-scoped via the operator session.

## Error handling / edge cases
- **iOS:** install = A2HS (manifest + apple meta + apple-touch-icon); no push in v1.
- **Desktop/Android:** install prompt (manifest + SW).
- **Offline:** cached app shell + a friendly "you're offline" state; data needs network.
- **No active agency:** SeldonFrame-default branding in the manifest + chrome.
- **Plan gate:** non-qualifying workspaces get the existing gate message (unchanged).

## Testing
- **Manifest route (unit):** per-agency output — name/theme_color/icons from `getEffectiveBrandingForWorkspace`; SF fallback when no agency.
- **Shell + screens:** the 4 screens render workspace-scoped data (manual on a real operator session + a demo; the underlying queries are already tested).
- **Install (manual):** Android/desktop install prompt fires; iOS A2HS shows the branded icon/name; launched standalone lands on Today.
- **Reused queries:** already covered by existing tests.

## Out of scope (v1 — fast-follow)
- **Web-push** (VAPID keys + subscription table + push endpoint + new-lead/new-message triggers).
- **Call-log screen** (no call history surfaced today).
- **Per-agency generated icons** (v1 uses agency logo or default).
- **Native app** (iOS/Android store), **Tap-to-Pay** — PWA only.
- **In-app SMS reply** if it's not a trivial reuse (read-first v1).
