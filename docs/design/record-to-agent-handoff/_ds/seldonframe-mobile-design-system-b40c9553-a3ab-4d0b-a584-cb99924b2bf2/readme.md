# SeldonFrame Mobile Design System

A white-label **mobile operations app** for local-service businesses — the branded, installable PWA that an electrician, HVAC tech, plumber, roofer, med-spa, or TRT clinic owner opens every day to run the business from their phone.

It is white-labeled **per marketing agency**: every screen adapts to the agency's brand color + logo, so each agency's clients experience it as *their own* app. The quality bar is GoHighLevel "LeadConnector" — but more refined. Think Linear / Stripe / Superhuman polish, on mobile.

> **The system in one sentence:** a light, near-white app on a refined cool-gray scale, where **one agency accent color** drives every highlight, active state, and primary button — and nothing else is colored — so the app looks premium in *any* brand color.

---

## Sources

This system was distilled from the **SeldonFrame** open-source codebase (the "MCP-native Business OS" — AI website builder + CRM + booking + intake + AI receptionist for local service businesses).

- **Codebase (read-only, mounted):** `Seldon Frame/` — the product app lives in `packages/crm` (Next.js App Router, React, Tailwind).
- **Design tokens read from:** `packages/crm/src/styles/design-tokens.css`, `packages/crm/src/app/globals.css`, `packages/crm/src/styles/design-system.md`, `packages/crm/src/components/ui/*` (Button/Badge/Card/Input primitives, base-ui + shadcn lineage).
- **White-label engine:** `packages/crm/src/lib/theme/*` and `packages/crm/src/lib/branding/actions.ts` — an org sets `primaryColor`, `logoUrl`, and `publicBrandName`; the app re-skins.
- **Typeface:** Geist + Geist Mono (`packages/crm/src/app/layout.tsx`).
- **Icons:** Lucide (`lucide-react`), used throughout the product.
- **Brand mark:** `packages/crm/public/logo*.svg` (the teal block-grid "SeldonFrame" mark — the *vendor* brand, intentionally invisible to end clients).

The web codebase is light-on-near-white with a teal default accent and a 0.75rem radius. This mobile system keeps that DNA (light theme, soft layered slate shadows, hairline borders, the `cubic-bezier(0.22,1,0.36,1)` ease) and re-tunes it for a 390px touch surface: bigger type, 48px tap targets, an 8pt grid, and an accent token that any agency overrides.

---

## CONTENT FUNDAMENTALS — how the product talks

The owner is **non-technical and time-poor**. Copy is plain, calm, and operational — it tells them what happened and what to do next, never markets at them.

- **Voice:** second person, direct, warm-but-efficient. "Connect a phone number to reply by SMS." "When a lead texts your business number, the conversation lands here." Speaks *to* the owner, *about* their customers.
- **Casing:** Sentence case everywhere — buttons ("New booking", "Request review"), titles ("Up next", "Booking details"), section eyebrows are the only UPPERCASE (small, tracked, muted). Never Title Case Buttons.
- **Labels are nouns/short verbs:** "Today", "Leads", "Messages", "Appts", "Reschedule", "Cancel". Tab labels are clipped for the bar ("Appts" not "Appointments").
- **Numbers lead.** Money, counts, and times are first-class — shown in Geist Mono with tabular figures so they align and don't jitter ("$48,200", "2:00 PM", "(602) 555-0148").
- **Status is a word + a color, never a color alone:** "Confirmed", "Pending", "No-show", "New", "Completed".
- **Vertical-aware vocabulary:** the same screens read as an HVAC shop or a med spa by swapping the noun — `customer` vs `client`, "Drain repair" vs "Botox consult". The system is generic; the *soul* (content) is per-business.
- **Empty + pending states reassure and instruct:** they explain why a thing is empty and offer the one next action. The "texting not enabled" state is explicitly honest, never a dead end.
- **No emoji. No exclamation spam.** One light, human touch at most ("Thanks for the quick fix!" from a customer — quoted, not authored by the app).

---

## VISUAL FOUNDATIONS

**Overall vibe:** quiet, premium, trustworthy. White cards float on a near-white canvas with hairline borders and soft, layered shadows. The accent is rationed — it appears on the active tab, the primary button, unread dots, and one "attention" KPI, and almost nowhere else. Restraint is the brand.

**Color**
- Light theme only. App canvas `--surface-app` (#f7f8fa); cards are pure white `--surface-card`.
- A single **cool slate** neutral ramp (`--gray-0 … --gray-900`) carries 95% of the UI. Text is `--gray-900` primary, `--gray-600` secondary, `--gray-500` muted, `--gray-400` faint.
- **One agency accent** (`--accent` + `--accent-strong`). Soft tints (`--accent-soft`, `--accent-soft-2`) and the focus ring derive from it via `color-mix`, so the system stays harmonious in any hue. Proven in **violet (#7c3aed)** and **rose (#e11d48)**; `.theme-blue/.theme-emerald/.theme-amber` ship too.
- Semantic colors are **fixed, never white-labeled**: positive (green), caution (amber), negative (red), info (blue). Each has a soft-tint companion for badges and wells.

**Type** — Geist for UI, Geist Mono for data. Mobile scale: display 28 / title 22 / heading 18 / body 16 / label 14 / caption 13 / eyebrow 11 (uppercase, tracked +0.06em). Display & titles get tight negative tracking; body never below 16px; nothing below 11px.

**Spacing & shape** — strict **8pt** grid (with 2/4px half-steps for dense rows). Radii: 12px fields, 16px cards, 22px sheets, pill for chips/search/segmented. Touch targets ≥ 48px (icon buttons get a 44px box minimum). Screen gutter 16px.

**Depth** — soft, layered, slate-tinted shadows (`--shadow-xs → --shadow-sheet`) *plus* a 1px hairline border on every surface. Never flat, never heavy. Primary buttons carry a faint accent-colored glow (`--shadow-accent`). Sheets cast an upward shadow.

**Backgrounds** — no photography, no gradients-as-decoration, no patterns. The only gradient is a whisper-soft radial on the page behind the phone. Surfaces are solid; the canvas is one flat near-white.

**Motion** — one confident ease, `--ease-out cubic-bezier(0.22,1,0.36,1)`, for nearly everything; `--ease-spring` for the sheet slide-up and card pops; `--ease-in-out` for calendar/page swaps. Durations: 120ms taps · 200ms transitions · 300ms sheets · 40ms per-item list stagger. **Press feedback:** buttons scale to 0.97, cards to 0.985 — never a color flash. All motion collapses under `prefers-reduced-motion`.

**Hover / press / focus** — this is touch-first, so press (scale-down) is the primary feedback. Focus shows a 3px accent ring (`--focus-ring`). Rows highlight to `--surface-sunken` on press. No desktop hover effects relied upon.

**Transparency & blur** — used sparingly and only where iOS does: the bottom tab bar is a `backdrop-filter` frosted surface over scrolling content; the sheet scrim is a 45% slate scrim. Everything else is opaque.

**Cards** — white, 1px `--border-hairline`, 16px radius, `--shadow-card`. List "panels" wrap rows with internal hairline dividers (inset 12px) rather than per-row borders. Tappable cards/rows get the press-scale.

**Loading & empty** — first-class, always. Every screen has a shimmer **skeleton** that mirrors its real layout (KPI tiles, list rows, calendar block) and a designed **empty state** (soft icon medallion + headline + one line + one action). These define perceived quality.

---

## ICONOGRAPHY

The icon system is **[Lucide](https://lucide.dev)** — the exact set the SeldonFrame product ships (`lucide-react`). Consistent rounded line icons: 24×24 grid, 2px stroke, round caps and joins. **No emoji, ever. No unicode glyphs as icons.**

- In React, use the bundled **`Icon`** component: `<Icon name="calendar-plus" size={20} />`. It reads real Lucide path data from the global `lucide` UMD object — so the glyphs are authentic Lucide, not redrawn. It inherits `currentColor`, so an icon tints with its parent text color.
- Every `@dsCard` and the UI kit load Lucide from CDN (`https://unpkg.com/lucide@latest/dist/umd/lucide.js`) **before** the bundle. In production (the real app) it's `lucide-react`.
- **Stroke weight is the constant.** Active nav icons bump to 2.25px stroke for weight; everything else stays at 2px. Icon chips (KPI, quick actions) sit on a soft-tint rounded square.
- Common names in use: `house`, `users-round`, `message-square`, `calendar`, `user-plus`, `calendar-plus`, `calendar-check`, `phone`, `phone-missed`, `scan-line`, `star`, `search`, `settings`, `bell`, `send`, `sticky-note`, `lock`, `map-pin`, `mail`, `wrench`, `sparkles`, `chevron-right`, `chevrons-up-down`.

**Brand marks** (`assets/`): `seldonframe-mark.svg`, `seldonframe-wordmark.svg`, `seldonframe-mark-white.svg` — the *vendor* identity (teal block-grid). It powers every workspace but is **never shown to the end client**. What clients see is their agency's accent monogram (or uploaded logo) in `AppHeader`.

> **Substitution flag:** Geist + Geist Mono load from Google Fonts (they're published there and match the product exactly). Lucide loads from CDN. If you want self-hosted font/icon binaries in the system instead, send them over and I'll vendor them in.

---

## Index / manifest

**Global CSS** — consumers link `styles.css` (only). It `@import`s:
- `tokens/fonts.css` — Geist + Geist Mono
- `tokens/colors.css` — neutral ramp · agency accent · semantic · surface/text aliases
- `tokens/typography.css` — families, weights, type scale
- `tokens/spacing.css` — 8pt scale, radii, control/touch sizing, mobile frame vars
- `tokens/elevation.css` — hairline + soft shadow ramp + accent glow + focus ring
- `tokens/motion.css` — easings, durations, press scales
- `tokens/base.css` — reset, white-label `.theme-*` accent scopes, shared keyframes, `.sf-skeleton`

**Components** (`components/`, namespace `window.SeldonFrameMobileDesignSystem_b40c95`):
- `core/` — `Icon`, `Button`, `IconButton`, `Badge`, `Avatar`, `Card`, `Skeleton`
- `forms/` — `Input`, `SearchField`, `SegmentedControl`
- `mobile/` — `KpiCard`, `QuickAction`, `SectionHeader`, `ListRow`, `EmptyState`, `MessageBubble`, `BottomTabBar`, `AppHeader`, `Sheet`

**UI kit** (`ui_kits/mobile-app/`) — the full interactive app, rendered in **two agencies at once** (Phoenix HVAC / violet · RedDoor Spa / rose) to prove white-label:
- `index.html` — entry (open this)
- `data.js` — mock data for both agencies
- `TodayScreen` · `LeadsScreen` · `MessagesScreen` (inbox + thread + composer) · `AppointmentsScreen` (month/week calendar + booking detail sheet) · `SearchOverlay` · `app.jsx` (PhoneFrame + shell)
- Designed so future tabs — an in-app **Dialer** and **Documents** — slot into `BottomTabBar` cleanly.

**Specimen cards** (`guidelines/`) — populate the Design System tab: color (neutrals / accent white-label proof / semantic), type (scale / families), spacing (8pt / radii / elevation / motion), brand.

**Other:** `assets/` (brand marks), `SKILL.md` (Agent Skills entry point).
