# UX Audit — SeldonFrame

**Date:** 2026-04-20
**Scope:** Booking, Intake Forms, CRM, Automation Visualizer.
**Constraint:** Read-only audit. No code changes. Wait for review before implementation planning.
**Basis:** Direct file reads + 4 parallel Explore subagent audits, one per surface.

> **Up-front contradiction with CLAUDE.md** — the framing ("fork cal.diy, Formbricks, Twenty, Automatisch") conflicts with the locked vision **"Thin harness + fat BLOCK.md skills + owned Brain v2."** Forking three full applications bloats the harness and blurs ownership. I flag this in §4 (Risk) and §5 (Sequencing). The audit itself is agnostic — the report tells the truth about what's there; the strategy is a separate decision.

---

## 1. Design System Inventory

### 1.1 Tokens

**Location:** `packages/crm/src/styles/design-tokens.css` (100 lines) + `packages/crm/src/app/globals.css` (wires them into Tailwind 4's `@theme inline`) + `packages/crm/tailwind.config.ts` (type scale + shadows).

**Colors — two incompatible formats in the same file:**
| Format | Tokens |
|---|---|
| `oklch(...)` | `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--destructive`, `--destructive-foreground`, `--sidebar`, `--sidebar-foreground`, `--sidebar-border`, `--sidebar-ring` |
| Raw hsl-triplet (`166 72% 40%`) | `--primary`, `--accent`, `--ring`, `--positive`, `--caution`, `--negative`, `--chart-1..5`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground` |

This split caused ~217 invalid-CSS bugs (oklch wrapped in `hsl()`) — fixed today in `cd2258f3` but the format mismatch itself remains a footgun. **Recommendation before any restyle**: unify to a single format (oklch throughout; `--primary` etc. migrated from hsl-triplets).

**Typography** (`tailwind.config.ts:8-18`): custom scale — `page-title` 32px, `section-title` 24px, `card-title` 18px, `body` 16px, `label` 14px, `data` 14px, `tiny` 12px. Good structure, consistently applied in `/dashboard` but **NOT** in admin sub-pages (booking admin uses ad-hoc `text-xl`, `text-[22px]`, `text-xs`).

**Shadows** (design-tokens.css:42-47): 6 shadow tokens (`xs`, `sm`, `card`, `card-hover`, `dropdown`, `modal`) + Tailwind aliases. Used everywhere; consistent.

**Motion** (design-tokens.css:49-51): 3 transition tokens (`fast` 120ms, `normal` 200ms, `slow` 300ms) + global framer-motion/motion packages installed.

**Radius:** single `--radius: 0.75rem` + derived `sm/md/lg/xl`. Consistent.

**Spacing:** Tailwind default (no custom scale). Inconsistent use of `gap-2/3/4/5` across pages.

### 1.2 Design-system component classes

**Location:** `packages/crm/src/styles/components/overrides.css` (423 lines). Defines `.crm-card`, `.crm-button-primary`, `.crm-button-secondary`, `.crm-button-ghost`, `.crm-input`, `.crm-modal-backdrop`, plus `.sf-public` variants for the public subdomain sites.

**Consistency across surfaces:**
| Surface | Uses design-system classes | Uses ad-hoc Tailwind |
|---|---|---|
| Dashboard (`/dashboard`) | Heavy | Medium |
| Booking admin (`/bookings`) | Light | **Heavy** |
| Forms admin (`/forms`) | Light | **Heavy** |
| CRM engine | None (uses Tailwind aliases directly) | Medium |
| Automation | Medium | Medium |

CRM engine components deliberately bypass `.crm-*` — they use raw Tailwind (`bg-card`, `text-foreground`, etc.) to stay portable across surfaces. This is arguably correct.

### 1.3 shadcn/ui primitives installed

**Actually used:** `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx` (rarely), `textarea.tsx`, `checkbox.tsx`, `accordion.tsx`, `badge.tsx`.

**Installed but decorative only** (mostly landing/marketing): `animated-list.tsx`, `bento-grid.tsx`, `border-beam.tsx`, `dock.tsx`, `marquee.tsx`, `number-ticker.tsx`, `particles.tsx`, `shimmer-button.tsx`, `square-primitives.tsx`, `typing-animation.tsx`.

**Not installed / missing for a real dashboard:**
- `dialog` (only `sheet` exists — and it's barely used)
- `dropdown-menu` (uses hand-rolled popovers)
- `command` (cmdk imported but not wrapped)
- `popover`
- `tooltip`
- `toast` (custom demo-toast only)
- `table` (hand-rolled in `contacts-inline-table.tsx` and `crm/table-view.tsx`)
- `tabs`
- `radio-group`
- `switch`
- `avatar`
- `scroll-area`
- `progress`
- `skeleton`

Hand-rolled replacements exist for most of these, but they're inconsistent (the booking drawer uses `fixed inset-0 flex` + a manual button for the backdrop; the command palette uses `crm-modal-backdrop` class).

### 1.4 Dependencies already in place for a bigger UI

- `@base-ui/react 1.3.0` — modern headless primitives (not obviously used)
- `@dnd-kit/core + sortable + utilities` — drag/drop (kanban, automation reorder)
- `framer-motion 12.38` + `motion 12.38` — both installed
- `lucide-react 1.7.0` — icons
- `@tanstack/react-table 8.21` — **installed, not used** (both tables are hand-rolled)
- `cmdk 1.1.1` — command palette (wrapped incompletely)
- `recharts 3.8.1` — charts
- `grapesjs` + `@puckeditor` — landing-page editors

---

## 2. Per-Surface Audit

### 2.1 Booking

**File tree (~2,750 LOC excluding spec):**
```
Admin:
├── app/(dashboard)/bookings/page.tsx                     76 LOC
├── components/bookings/bookings-page-content.tsx        698 LOC
├── lib/bookings/actions.ts                             1031 LOC
├── lib/bookings/google-calendar-sync.ts                 299 LOC
├── lib/bookings/providers.ts                             37 LOC
└── api/v1/booking/configure/route.ts                    139 LOC
Public:
├── app/book/[orgSlug]/[bookingSlug]/page.tsx             46 LOC
└── components/bookings/public-booking-form.tsx          174 LOC
Schema:
└── db/schema/bookings.ts                                 41 LOC
Spec:
└── blocks/caldiy-booking.block.md                       408 LOC
```

**Visual fidelity: 4/10.** Admin calendar is a hand-rolled week grid — times as bare labels, events as cramped truncated cards, no drag handles, no hover states. Public form is Bootstrap-era: date dropdown → slot select → basic inputs. No calendar picker, 14-day window hard-coded, no availability scarcity signals. Appointment-type cards are grey boxes with no preview / embed code / toggle.

**Patterns present:** slot availability math (30/60 min + buffer + max-per-day), weekly availability editor, Google Calendar read-only sync, Stripe payment redirect, status tracking, week navigation, search/filter. Confirmation messages inherit from Soul voice.

**Patterns missing (Cal.diy has, SeldonFrame doesn't):** recurring bookings, rescheduling/cancellation public links, round-robin / collective hosts, custom per-type question fields (the `bookingFields` schema is absent), iCal/ics attachments, minimum booking notice, seats/group bookings, private hashed links, Zoom/Daily/Meet URL auto-gen, webhooks/workflows, reminder automation, server-side timezone normalization.

**A11y red flags:** non-semantic calendar grid (no `role="grid"`/`aria-label`), bare `<select>` for time slots, color-only status badges, no focus rings on event cards, tiny `text-xs` throughout, no `aria-expanded` on filter toggles, no `aria-invalid` on form inputs.

**Responsive state:** Desktop-only calendar. 375px → grid breaks, horizontal scroll forced. 768px → still cramped.

**Replace in a fork:** calendar grid JSX in `bookings-page-content.tsx` (~200 LOC), `create-booking-form.tsx`, `providers.ts`.

**Keep:** `db/schema/bookings.ts` (clean Drizzle schema — JSONB metadata for per-type config), `google-calendar-sync.ts` (simpler than Cal.diy's full 2-way sync), the slot-availability math in `actions.ts`, Soul voice integration in confirmations, bearer-token public URLs, the 408-line BLOCK.md spec itself.

---

### 2.2 Intake Forms

**File tree (~1,136 LOC):**
```
Admin:
├── app/(dashboard)/forms/page.tsx                        80 LOC
├── app/(dashboard)/forms/[id]/page.tsx                   46 LOC
├── app/(dashboard)/forms/[id]/edit/page.tsx              40 LOC
├── components/forms/form-editor.tsx                     217 LOC
└── components/forms/forms-page-actions.tsx              103 LOC
Public:
├── app/forms/[id]/[formSlug]/page.tsx                    60 LOC
└── components/forms/public-form.tsx                      60 LOC
API:
├── api/v1/forms/submit/route.ts                         157 LOC
└── api/v1/forms/[id]/submissions/route.ts                49 LOC
Schema + actions:
├── db/schema/intake-forms.ts                             53 LOC
├── db/schema/form-submissions.ts                         19 LOC
└── lib/forms/actions.ts                                 264 LOC
Spec:
└── blocks/formbricks-intake.block.md                    290 lines
```

**Visual fidelity: 3/10.** The public form is bare `<input>` + `<label>` + `<button>` with zero polish. Admin editor is a stack of grey rows. No welcome cards, progress indicators, animations, or personality — reads "2015 server error page" vs Typeform/Tally/Formbricks.

**Patterns present:** 5 field types (text, email, phone, textarea, select), required toggle, up/down field reordering, auto-upsert contact on email submit, Brain event emit on `form.submitted`.

**Patterns missing (Formbricks has):** conditional logic / branching, multi-step wizard (one-question-per-page), progress indicator, welcome card, ending pages (thank-you variants), hidden fields / URL prefill, file uploads, matrix/ranking, NPS/rating, visual logic editor, webhooks, per-user display rules, response analytics, email verification.

**A11y red flags:** no `aria-label` / `aria-describedby` / `aria-required`, no focus jump on error, no `role="group"` on fieldsets, color-only errors, unnested checkbox labels, no skip-to-content, 4 responsive breakpoints across 3 files.

**Responsive:** single-column `max-w-xl` centered. Touches OK on mobile but inputs tight (`h-10 px-3`).

**Replace in a fork:** `public-form.tsx`, `form-editor.tsx`, `forms-page-actions.tsx` — all three.

**Keep:** `intake-forms.ts` schema (JSONB `fields` is easy to extend to Formbricks' `questions`), `submitPublicIntakeAction` (elegant email→contact upsert + event emit), `guardApiRequest` org-scoped pattern, the 290-line BLOCK.md spec (it's thorough and explicitly says "reuse `/forms/**`, gate Formbricks behind `metadata.formbricks === true`").

---

### 2.3 CRM

**File tree (~6.2K LOC total):**
```
Engine (~1.8K LOC):
├── components/crm/kanban-view.tsx                       340 LOC
├── components/crm/table-view.tsx                        282 LOC
├── components/crm/record-page.tsx                       203 LOC
├── components/crm/activity-timeline.tsx                  98 LOC
├── components/crm/crm-view-renderer.tsx                  92 LOC
├── components/crm/contacts-crm-surface.tsx               73 LOC
├── components/crm/deals-crm-surface.tsx                  84 LOC
├── components/crm/custom-object-crm-surface.tsx         107 LOC
├── components/crm/utils.ts                              185 LOC
└── components/crm/types.ts                              132 LOC
View config & parsers (~3.2K LOC):
├── lib/blocks/block-md.ts                               743 LOC
├── lib/crm/view-config.ts
├── lib/crm/view-models.ts
├── lib/crm/view-intents.ts
├── lib/crm/generated-views.ts
├── lib/crm/custom-objects.ts
├── lib/crm/custom-object-actions.ts
└── lib/crm/custom-object-permissions.ts
Page mounts:
├── /contacts, /contacts/[id], /contacts/new
├── /deals, /deals/[id], /deals/pipeline
└── /objects/[objectSlug], /objects/[objectSlug]/[id], /objects/[objectSlug]/pipeline
Legacy / redundant (~1.2K LOC):
├── components/contacts/contacts-inline-table.tsx        155 LOC
├── components/contacts/create-contact-form.tsx
├── components/contacts/create-contact-page-form.tsx
├── components/contacts/contacts-page-actions.tsx
├── components/contacts/csv-import.tsx
├── components/deals/kanban-board.tsx                    197 LOC  (orphaned — unmounted)
└── components/deals/create-deal-form.tsx
```

**Visual fidelity: 6.5/10.** This is the most mature surface. Clean borders, shadow system, field badges, avatar circles, kanban + table + record + timeline via a real renderer.

Weaknesses: table cells cramped (2px padding, `min-w` forces horizontal scroll on mobile); kanban lane headers neutral (fix shipped today in `dd7b8a28`); no column resize; no inline-edit focus polish / undo affordance; record page grid `sm:grid-cols-[180px_1fr]` stacks awkwardly at tablet breakpoint; no relation hover cards (`CrmRelationshipPreview` type exists, unused).

**Patterns present:** dnd-kit kanban drag, WIP limits (metadata present, now visually rendered), stage colors (shipped today), `scopedOverride` system (per-client hiddenFields/labelOverrides/editableFields), `endClientMode` boolean, 4 view types (table/kanban/record/timeline) dispatched from BLOCK.md `views`, table sort + filter, inline cell edit with draft state, search, custom objects, saved view config (stored, not yet selectable in UI).

**Patterns missing (Twenty has):** spreadsheet-style bulk edit, column resize, URL state for filters, density toggle, multi-select cells, relation hovers, inline activity feed in table, field-level comments, view duplication, visual segment filter builder (AND/OR trees), keyboard shortcuts in kanban (arrow + shift to move), focus-trap in detail drawer.

**A11y red flags:** dnd-kit focus handled but no keyboard move-card shortcuts; no `role="row"` / `scope="col"` on table; no `aria-label` on inline-edit inputs; stage-badge contrast borderline AA; detail drawer doesn't trap focus.

**Responsive state:** kanban full-width horizontal scroll (no lane collapse); table overflows (no sticky first column); record page `lg:flex-row` OK above 1024px, tight below; contacts filter bar stacks well.

**Replace (legacy):** `contacts/contacts-inline-table.tsx`, `contacts/contacts-page-actions.tsx`, `deals/kanban-board.tsx` (197 LOC, orphaned since the engine landed — uses framer-motion on cards, engine uses plain CSS).

**Keep (novel vs Twenty):** `block-md.ts` parser (lightweight vs Twenty's JSON config), `view-config.ts` client-scoped overrides (Twenty has no equivalent), `applyScopedViewOverride()` merge logic, `CrmScopedOverride` type, `endClientMode` flag, the custom-object kanban surface, the unified activity-timeline.

---

### 2.4 Automation

**File tree (~1,822 LOC across 6 files):**
```
Page:
└── app/(dashboard)/automations/page.tsx                  98 LOC   (server-side, loads Soul)
Cron runner:
└── api/cron/automations/route.ts                         47 LOC
UI:
├── components/automations/soul-automations-overview.tsx 253 LOC
└── components/automations/automation-builder.tsx        349 LOC
Server logic:
├── lib/automations/soul-automations.ts                  384 LOC
└── lib/automations/generated-workflows.ts               691 LOC
```

**Current UI:** Three sections on `/automations`:
1. "Suggested Automations" — 2-col cards reading "When X → Then Y" with on/off toggles + integration status badges (Stripe/Resend/Twilio/Kit/Google).
2. "Soul-Inferred Workflows" — cards extracted from `organizations.soul.journey.stages[].autoActions[]` as sentence strings ("send welcome email after 2 days").
3. "Need custom automation?" link to `/seldon` for AI-generated workflows.

**There is NO visual canvas today.** List-based, toggle-driven. The `automation-builder.tsx` is a vertical dnd-kit-sortable node list with a sidebar palette — not a canvas.

**Visual fidelity: 2/10 vs Automatisch / n8n / Zapier / React Flow.** Aspirational gap is massive. Sentence cards are clean for simple linear automations but completely unfit for branching/parallel workflows.

**Patterns present:** toggle on/off, humanized trigger labels (`contact.created` → "When someone reaches out"), integration status checks, drag-to-reorder (dnd-kit vertical), "Save Template" button (alerts, no persistence), "Run Test" stub.

**Patterns missing:** canvas/connectors/zoom/pan/node positions, per-node config panel, conditional branching UI, execution history / run logs, debug mode with live event simulation, undo/redo, node search, multi-trigger or parallel branches, manual trigger execution.

**A11y red flags:** drag buttons no label/role, `useSortable` adds no ARIA, color-only status dots in places, no arrow-key alternative to mouse-drag. Canvas would compound these.

**Responsive state:** grid collapses well; `xl:grid-cols-[320px_1fr_340px]` sidebars stack on small screens; no canvas to worry about yet.

**Replace if going to React Flow:** all of `automation-builder.tsx`, the `DndContext` + `SortableContext` wrappers, the static-palette-list-plus-button-handlers pattern. Keep the palette concept; swap button handlers for canvas drop target.

**Keep:** `soul-automations.ts` (stage matching, "X days" delay parsing, task dedup — essential server logic), `generated-workflows.ts` (workflow defs stored in `organizations.settings`, condition matching, event routing), `route.ts` cron runner, the server-side page shell, the DB schema. **The canvas is purely a richer editing UX on top of existing data.**

---

## 3. Dependency & Licensing Check

### 3.1 Current UI-relevant dependencies

From `packages/crm/package.json`:

| Package | Version | License | Use |
|---|---|---|---|
| `next` | 16.2.1 | MIT | framework |
| `react` | 19.2.4 | MIT | — |
| `@base-ui/react` | 1.3.0 | MIT | headless primitives (lightly used) |
| `@dnd-kit/*` | 6.3 / 10 / 3.2 | MIT | kanban + automation drag |
| `@tanstack/react-table` | 8.21.3 | MIT | **installed, unused** (tables are hand-rolled) |
| `cmdk` | 1.1.1 | MIT | command palette (partial) |
| `framer-motion` + `motion` | 12.38 (both) | MIT | redundant — pick one |
| `lucide-react` | 1.7.0 | ISC | icons |
| `recharts` | 3.8.1 | MIT | charts |
| `grapesjs` | 0.22.14 | BSD-3 | landing editor |
| `@puckeditor/core` + `cloud-client` | 0.21 / 0.6 | MIT | landing editor alt |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | variant system |
| `tailwind-merge` | 3.5 | MIT | className dedup |
| `shadcn` | 4.1.0 | MIT | primitive CLI |
| `tw-animate-css` | 1.4 | MIT | animation utilities |

### 3.2 License compatibility of candidate forks

| Source | License | Compatible with SeldonFrame? | Notes |
|---|---|---|---|
| **Cal.diy** (community fork of Cal.com) | **MIT** | ✅ Yes | Safe to fork, modify, and redistribute as part of a commercial product. No copyleft obligation. |
| **Formbricks** | **AGPLv3** | ⚠️ **Not compatible with closed-source SaaS distribution** | AGPL requires providing source to any user interacting with a modified instance over the network. If SeldonFrame is distributed as SaaS, the entire codebase must be AGPL. |
| **Twenty** | **AGPLv3** | ⚠️ **Same AGPL constraint** | Same as Formbricks. Forking Twenty effectively re-licenses SeldonFrame as AGPL unless a separate license is negotiated with TwentyHQ. |
| **Automatisch** | **AGPLv3** (business edition EE) | ⚠️ **Same constraint** | Core is MIT but the flow-builder UI / node library may be in the AGPL business edition. Check which part is being forked. |
| **React Flow (xyflow)** | **MIT** | ✅ Yes | Library-only, no forking needed. Import and build a canvas directly. |

**Critical flag:** three of the four proposed forks are AGPLv3. If SeldonFrame is a commercial SaaS product (which CLAUDE.md implies — "First workspace is free forever. Additional workspaces = $9/month"), forking AGPL code without re-licensing the whole app is a legal problem, not a technical one.

**Options if you want Formbricks / Twenty UX without forking:**
1. **Take inspiration, reimplement** — copy patterns / layouts / interactions, don't copy code. Clean-room reimplementation on top of the existing engine.
2. **Use the Formbricks/Twenty JS SDK** (if they publish one under MIT) — embed them as an external service rather than forking.
3. **Re-license**: negotiate a commercial license with TwentyHQ / Formbricks.
4. **Re-license SeldonFrame as AGPL** — likely not the intent given the $9/mo pricing model.

React Flow (MIT) is unambiguously fine. Cal.diy (MIT) is fine.

---

## 4. Risk Register

### 4.1 Contradiction with CLAUDE.md "Thin harness + fat BLOCK.md"

The locked vision says the **harness stays thin**; **features live in forkable BLOCK.md skills** — not in the main app. The proposed UX overhaul is framed as *"fork cal.diy / Formbricks / Twenty / Automatisch into the codebase."* Literal forking contradicts this on three axes:

1. **Harness bloat.** Each fork adds tens of thousands of LOC. Twenty alone is ~150k LOC; Cal.com is ~200k. SeldonFrame's `packages/crm` is currently ~40k. Merging any one of these triples the codebase.
2. **Ownership blur.** CLAUDE.md says "owned Brain v2." Forked upstreams have their own ORMs, schemas, auth systems, and UI conventions that pull in opposite directions to `organizations.soul.*` and the scoped-override engine.
3. **Forkability inversion.** The architecture is supposed to enable *builders* to fork BLOCKs into the marketplace. Forking an external app as "the" UI makes the app the product and the BLOCKs vestigial.

**Alternate framing that honors the vision:** steal the *design patterns* (Cal.diy's booking flow shape, Formbricks' question-by-question pacing, Twenty's table density, React Flow's canvas) and reimplement inside the existing engine as fat BLOCK.md skills. This is more work upfront but stays on-mission.

### 4.2 Design-token system change — blast radius

If §1 recommendation lands (unify colors on oklch; convert `--primary` etc. from hsl-triplets):
- **Files touched:** ~42 already touched today for the invalid-CSS fix; a token format unification would re-touch the same files PLUS every `hsl(var(--primary))` site (currently valid; would become invalid or need to move to Tailwind alias).
- **High-risk files:** `landing/sections/*` (13 files) — they use `hsl(var(--primary))` heavily for the marketing gradient palette. Any unification breaks visuals unless each landing section is re-reviewed.
- **Mitigation:** do it in a single focused slice with a dry-run codemod (same approach as today's fix), land it before any surface redesign so the substrate is stable.

### 4.3 Cross-surface component sharing

Components shared across surfaces (changing one affects all):
- `packages/crm/src/components/ui/*` (shadcn primitives) — used by all four surfaces
- `packages/crm/src/styles/components/overrides.css` (`.crm-card`, `.crm-button-*`, `.crm-input`) — used by Booking, Dashboard, Contacts, Forms admin, Marketplace
- `packages/crm/src/components/crm/*` (the engine) — used by CRM surfaces today, but designed to be used for custom objects too, so Automation / Forms admin could adopt it as they mature
- `lib/blocks/block-md.ts` — parser; every BLOCK installation flows through it

Risk: a global restyle of `.crm-card` (say, tighter padding + new shadow) ripples through ~40 pages. Each ripple is a spot-check item.

### 4.4 Surfaces where forking beats restyling

Per the audit scores:
- **Intake (3/10)** — only 1.1k LOC. Restyling is almost as much work as rewriting. Rewriting is clearer.
- **Automation (2/10)** — UI is 602 LOC (of 1,822 total). Rewriting is strictly cheaper than restyling a list into a canvas. Keep all server logic.
- **Booking (4/10)** — 2,750 LOC, of which ~700 is the admin content and ~174 is the public form. Medium refactor; many features missing. Candidate for partial rewrite of calendar grid + public form, preserve slot math + Google sync + schema.
- **CRM (6.5/10)** — engine is sound, polish lags. Restyle + add missing affordances (column resize, density, hover cards). Do NOT fork.

### 4.5 Orphaned code — delete before anything else

- `packages/crm/src/components/deals/kanban-board.tsx` — 197 LOC, unmounted, superseded by engine. Remove.
- `packages/crm/src/components/contacts/contacts-inline-table.tsx` — 155 LOC, superseded by engine `TableView`. Remove after verifying `/contacts` mounts the engine.

### 4.6 License risk (repeat of §3.2 for visibility)

Forking Formbricks / Twenty / Automatisch EE under AGPLv3 without re-licensing SeldonFrame is a legal exposure, not just a code-quality question. Flag to resolve before any fork decision.

---

## 5. Recommended Sequencing

### 5.1 Disagreement with proposed order

The proposed order was: **design system → booking → intake → CRM → automation.**

I partially agree. Specifically:
- ✅ Design system first is correct.
- ❌ Booking before CRM is wrong if the strategy is to steal Twenty's density + inline-edit for CRM. Booking needs a much bigger lift (4/10 → 9/10) than CRM does (6.5/10 → 9/10). The CRM delta is smaller and more visible (it's the daily driver for every user).
- ❌ Intake before CRM leaves the intake form dumping into a CRM that looks unchanged — the submission → contact → pipeline flow is continuous from the user's perspective. Polishing the middle step while the endpoint still looks dated makes the intake polish feel stranded.

### 5.2 Proposed alternative sequencing

**Phase 0 — Substrate (prereq for everything):**
- 0a. Unify color tokens to a single format (oklch throughout). One slice.
- 0b. Delete orphaned legacy components (`deals/kanban-board.tsx`, `contacts/contacts-inline-table.tsx`). One slice.
- 0c. Install missing shadcn primitives (`dialog`, `dropdown-menu`, `tooltip`, `popover`, `table`, `tabs`, `avatar`, `scroll-area`, `toast`). One slice.
- 0d. Standardize drawer/sheet/modal: pick `ui/sheet.tsx`, kill the hand-rolled `fixed inset-0` drawers in booking + contacts. One slice.

**Phase 1 — CRM polish (highest visibility, smallest delta):**
- Lane headers, card hover previews, column resize, density toggle, relation hovers, focus trap in drawer, a11y pass on table.
- This is on top of the engine that shipped today. No fork.
- Estimated: 2-3 slices.

**Phase 2 — Decision gate on "fork vs reimplement":**
- Resolve the AGPL question for Formbricks / Twenty / Automatisch EE. If SeldonFrame is to remain non-AGPL, reframe as "inspire from, reimplement inside engine."
- One design-spec slice per surface (Booking, Intake, Automation) where you decide the exact UX shape with Visual Companion mockups **before** code.

**Phase 3 — Booking rewrite (biggest delta):**
- Rewrite calendar grid (use react-big-calendar or a similar MIT library as a component, not a fork) + public booking flow.
- Add the 6 highest-value missing features: recurring bookings, reschedule link, cancel link, per-type questions, minimum notice, Zoom/Meet URL.
- Keep schema + Google sync + Soul voice integration. Do NOT fork Cal.diy wholesale.
- Estimated: 4-5 slices.

**Phase 4 — Intake rewrite:**
- Rewrite public form as one-question-per-page with progress, welcome card, ending pages.
- Add conditional logic, hidden fields, file upload.
- Reuse schema + actions layer + contact upsert.
- Estimated: 3-4 slices.

**Phase 5 — Automation canvas:**
- Import `reactflow` (MIT). Build canvas on top of existing `lib/automations/*` server logic.
- Node library → canvas drop target. Per-node config panel. Execution history.
- Estimated: 4-6 slices.

### 5.3 Sequencing rationale

1. **Substrate first** — fixes the common breakage, reduces risk for every later slice.
2. **CRM second** — highest user-visible daily-driver surface, smallest design delta, biggest per-slice ROI.
3. **Decision gate** — don't spend weeks forking AGPL code and later discover a license problem.
4. **Booking third** — medium complexity, lots of missing features, but schema and server logic are solid.
5. **Intake fourth** — small codebase, clean rewrite, logical follow-on to booking since they share the "public subdomain" surface.
6. **Automation last** — biggest design gap, least business-critical (few workspaces will run complex workflows on day 1), requires the deepest net-new UI.

---

## Summary table

| Surface | LOC | Visual fidelity | Recommendation | License risk |
|---|---|---|---|---|
| Design tokens | — | mixed-format | Unify to oklch in Phase 0 | none |
| Booking | 2,750 | 4/10 | Rewrite calendar + public form; keep schema + Google sync + slot math + BLOCK.md | Cal.diy is MIT — safe to reference |
| Intake | 1,136 | 3/10 | Rewrite UI; keep schema + actions + contact upsert + BLOCK.md | Formbricks is AGPL — do NOT literal-fork |
| CRM | ~6,200 | 6.5/10 | Polish in place; delete legacy orphans | Twenty is AGPL — do NOT literal-fork |
| Automation | 1,822 | 2/10 | Build canvas on React Flow (MIT); keep server logic | Automatisch EE is AGPL — only core is MIT |

---

## What I want from you before proposing an implementation plan

1. Confirm or push back on the thin-harness-vs-fork framing in §4.1. Do you want literal forks (AGPL risk, harness bloat) or inspired-reimplementation (more work, stays on-mission)?
2. Confirm sequencing §5.2 — specifically the CRM-before-Booking flip.
3. Acknowledge the AGPL issue in §3.2 — especially for Twenty and Formbricks.
4. Decide whether Phase 0 (substrate cleanup) is worth its own 2-3 slices or whether you want to start with Phase 1 directly (adds risk).

Waiting for review.
