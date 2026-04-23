# SLICE 4 — Unified UI composition layer: audit

**Draft:** 2026-04-23
**Sprint:** Scope 3 rescope, SLICE 4 of 9 (primitive-completion)
**Status:** AUDIT ONLY. No code until every gate in §8 resolves.
**Inputs:** Scope 3 rescope message (2026-04-22), `tasks/lessons.md` L-15 through L-22 + all L-17 addenda (incl. the SLICE 3 dispatcher-count rule), SLICE 1/2/3 audits + close-outs.

---

## 1. Problem statement

### 1.1 What this slice exists to ship

A **unified UI composition layer** on top of shadcn/ui that:

1. Gives admin surfaces (builder + SMB staff) a consistent set of page-level + data-level composition primitives — tables, forms, detail panels, kanbans, timelines.
2. Gives customer-facing surfaces (booking widget, intake forms, landing pages, portal) a consistent quality bar + theme-aware presentation.
3. Auto-generates admin UIs for **scaffolded blocks** from their BlockSpec, so new blocks don't require hand-authoring 8 component files.
4. Propagates workspace branding consistently across both audiences.

The foundation is **shadcn/ui + the existing design tokens + magic-link auth**, all present at HEAD (§7). The slice assembles these into opinionated composition patterns, not a new component library.

### 1.2 Why this matters

Five problems the current state has that SLICE 4 closes:

1. **Admin UI drift across 13 shipped block surfaces.** Every block hand-authored its own page-content / form / table components. Token usage (`text-page-title` etc.) is applied in ~10 places but inconsistently. Direct shadcn imports number only 25 — most blocks reinvent similar layouts.
2. **Scaffolded blocks have NO admin UI.** SLICE 2 ships BLOCK.md + tools.ts + test stubs; a builder who scaffolds `vehicle-service-history` gets zero pages in `(dashboard)/vehicle-service-history/`. Every scaffold currently requires hand-writing the admin surface.
3. **Customer-facing quality floor is uneven.** `book/[orgSlug]/[bookingSlug]/page.tsx` (46 LOC), `forms/[id]/[formSlug]/page.tsx` (63), `l/[orgSlug]/[slug]/page.tsx` (63) — three different looks, three different layouts. The portal's `(client)/` area is its own thing again.
4. **Workspace branding is wired but shallow.** `OrgTheme` has 6 properties; `themeToCSS` maps them to ~10 CSS vars. The theme applies on public surfaces via `public-theme-provider.tsx` but admin surfaces aren't theme-aware beyond light/dark.
5. **No composition API enforces quality.** A new admin page can land without using any of the design tokens or layout primitives; the only pressure is code review. L-22 structural enforcement is weak.

### 1.3 Foundation (do NOT rebuild)

Per Max's directive + §7 ground-truth:
- **shadcn/ui** is the component foundation. Already installed + 30 components present.
- **Tailwind v4 + design tokens** are the styling system. oklch colors, typography scale, shadow system, transitions all defined.
- **Magic-link auth is SHIPPED** — both user-level (`lib/auth/magic-link.ts`) and portal-level (`lib/portal/auth.ts`). No need to re-implement. Originally scoped as a supporting primitive; §7 verification removes it from scope.

What SLICE 4 ADDS on top: composition patterns, scaffold→UI bridge, theme-aware admin surface, quality-enforcing API.

---

## 2. Atomic decomposition

Eight composition patterns total — **5 admin + 3 customer-facing**.

### 2.1 Admin patterns (5)

| Pattern | Purpose | Shadcn primitives it composes | Approx LOC |
|---|---|---|---|
| `<EntityTable>` | Tabular list with filter + sort + pagination | table + input + button + select | 180 |
| `<EntityForm>` | Create/edit form derived from Zod schema | form + input + select + textarea + button | 200 |
| `<EntityDetail>` | Side-drawer or page detail view | sheet + dialog + card + tabs | 150 |
| `<EntityKanban>` | Drag-drop kanban for stage-tracked entities | card + dnd-kit + badge | 180 |
| `<PageShell>` | Admin page wrapper: title + breadcrumbs + actions | button + separator + dropdown | 120 |

**Total admin patterns:** ~830 LOC production.

### 2.2 Customer-facing patterns (3)

| Pattern | Purpose | Approx LOC |
|---|---|---|
| `<BookingWidget>` | Cal.com-style time-picker + confirmation | 250 |
| `<IntakeForm>` | Themed form derived from intake-form schema | 180 |
| `<CustomerShell>` | Customer-facing layout with brand applied | 120 |

**Total customer patterns:** ~550 LOC production.

### 2.3 Supporting primitives

| Component | Purpose | Approx LOC |
|---|---|---|
| Typed design-token wrapper | `tokens.spacing[4]` etc. instead of raw strings | 80 |
| Theme bridge (admin) | Apply OrgTheme to admin surface (was public-only) | 60 |
| Scaffold→UI bridge | Generate admin page stubs from BlockSpec | 250 |
| Composition test harness | Render+snapshot tests for all 8 patterns | (test-only) |

**Total supporting:** ~390 LOC production.

**Grand total production (new code):** ~1,770 LOC. Tests ~2.5x per Max's directive: ~4,425 LOC. Add integration harness (artifact ~300 LOC). **Grand total ~6,495 LOC.**

---

## 3. Ground-truth verification at HEAD (L-16 / L-20)

Verified 2026-04-23 against `claude/fervent-hermann-84055b`.

### 3.1 Tailwind + design tokens

- `packages/crm/tailwind.config.ts` (62 LOC) — Tailwind v4 config. Typography scale defined (`text-page-title`, `text-section-title`, `text-card-title`, `text-body`, `text-label`, `text-data`, `text-tiny`). Shadows, transition timings, animations. Geist sans + mono via CSS vars.
- `packages/crm/src/app/globals.css` (197 LOC) — imports Tailwind v4, shadcn/tailwind.css, tw-animate-css, custom design-tokens.css. Defines `@theme inline` block mapping all shadcn CSS vars. Custom utilities for typography + positive/caution/negative colors.
- `packages/crm/src/styles/design-tokens.css` (100 LOC) — oklch tokens. Primary teal `oklch(0.675 0.126 171.53)`. Comments preserve HSL predecessors. Dark mode overrides present. Chart colors 1-5. Sidebar + accent variants. Radius `0.75rem`.

**Verdict:** robust. SLICE 4 wraps these in a typed API; doesn't replace them.

### 3.2 shadcn/ui installation

- `shadcn` v4.1.0 in `packages/crm/package.json` (direct dep).
- `@radix-ui/react-icons` + `lucide-react` both present.
- 30 components in `packages/crm/src/components/ui/` totaling 3,033 LOC:
  - **Core forms/inputs:** accordion, avatar, badge, button, card, checkbox, dialog, dropdown-menu, input, label, popover, scroll-area, select, separator, sheet, sonner (toast), table, tabs, textarea, tooltip.
  - **Specialty/motion:** animated-list, bento-grid, border-beam, dock, marquee, number-ticker, particles, shimmer-button, square-primitives, typing-animation.
- Direct shadcn imports in block components: 25 grep hits across 13 block surfaces — sparse reuse.

**Verdict:** foundation is ready. SLICE 4 uses what's present; installs 0-3 more (evaluate: `command`, `calendar`, `skeleton` if missing).

### 3.3 Admin UI patterns across 13 block surfaces

`packages/crm/src/components/` has per-block directories for: activities, automations, bookings, contacts, crm, dashboard, deals, emails, forms, hub, landing, orgs, portal, seldon, theme. Plus top-level: layout, marketing, puck, shared.

**Consistency:**
- Typography token usage (`text-page-title`, etc.): 10 block files grep-match the utility classes. 3 blocks (activities, deals, emails) don't use them.
- Direct shadcn imports: 25 total. Avg ~2 per block.
- No shared `<PageShell>` / `<EntityTable>` pattern exists. Each block hand-authored its content + actions.

**Drift:**
- Contacts uses table layout; Deals uses kanban; Bookings uses calendar-table hybrid. Different widgets, different spacing, different active states.
- `layout/sidebar.tsx` + `dashboard-topbar.tsx` (813 LOC combined) provide the shell around them. Stable; SLICE 4 doesn't touch.
- `(dashboard)/layout.tsx` is the route-level wrapper.

**Verdict:** SLICE 4 introduces `<PageShell>` + `<EntityTable>` + `<EntityForm>` as the pattern. Existing block UIs are NOT forcibly migrated (scope would explode) — they continue working. Migration is opt-in and opportunistic per block.

### 3.4 Customer-facing surfaces

Four classes exist:

| Route | File (LOC) | Status |
|---|---|---|
| `book/[orgSlug]/[bookingSlug]` | 46 | Booking widget. Theme applied via `public-theme-provider`. |
| `forms/[id]/[formSlug]` | 63 | Intake form. Themed. |
| `l/[orgSlug]/[slug]` | 63 | Landing page. Themed. |
| `(public)/s/[orgSlug]/[...slug]` | — | Generic public block-render path. |
| `portal/[orgSlug]/(client)/` | 43+45 | Authenticated customer portal. Own layout.tsx. |

All four route classes already apply `public-theme-provider` + `apply-theme`. Quality varies because each was authored independently.

**Portal has its own full layout** (`portal/[orgSlug]/(client)/layout.tsx` 43 LOC). SLICE 4 unifies across all four under a shared `<CustomerShell>` that consumes OrgTheme.

### 3.5 Magic-link auth — ALREADY SHIPPED

This is the biggest ground-truth correction. Originally scoped as a supporting primitive per the rescope message; **§7 confirms it's fully operational.**

| File | LOC | Purpose |
|---|---|---|
| `lib/auth/magic-link.ts` | 83 | User-level magic links via NextAuth + Resend verification token flow. `mintClaimMagicLink(email, callbackPath)`. |
| `lib/portal/auth.ts` | 278 | Customer-level portal sessions. 6-digit codes + magic-link sessions. `establishPortalMagicSession`. |
| `lib/portal/session.ts` | 58 | JWT signing for portal cookies (`portal_session`). |
| `app/portal/[orgSlug]/magic/route.ts` | 27 | GET handler — `?token=...&redirect=...` → establishes session, redirects. |
| `app/portal/[orgSlug]/login/page.tsx` | 15 | Portal login UI (calls auth.ts actions). |

**Verdict:** REMOVED from SLICE 4 scope. Any UI extension (e.g., a themed login page) is in scope; the auth mechanism itself is not.

### 3.6 Workspace branding

| File | LOC | Purpose |
|---|---|---|
| `lib/theme/types.ts` | 17 | `OrgTheme` interface — 6 properties. |
| `lib/theme/apply-theme.ts` | 23 | `themeToCSS(theme) → CSS var map` + googleFontUrl. |
| `lib/theme/normalize-theme.ts` | 45 | Coerces arbitrary input to OrgTheme. |
| `lib/theme/actions.ts` | 140 | Server actions — load/save from `organizations.soul.branding`. |
| `components/theme/public-theme-provider.tsx` | 24 | React provider for public surfaces. |
| `components/theme/theme-settings-form.tsx` | 196 | Admin form for editing OrgTheme. |

**OrgTheme schema:**
```ts
{
  primaryColor: string;        // hex
  accentColor: string;
  fontFamily: "Inter" | "DM Sans" | "Playfair Display" | "Space Grotesk" | "Lora" | "Outfit";
  mode: "light" | "dark";
  borderRadius: "sharp" | "rounded" | "pill";
  logoUrl: string | null;
}
```

Stored in `organizations.soul.branding`. Applied via CSS custom properties. Admin surface isn't themed today — SLICE 4 optionally extends.

**Verdict:** theme data + serialization + public application all exist. SLICE 4 extends to admin surfaces + scaffolded UIs + adds typed read API.

### 3.7 Scaffold → UI bridge

**Does NOT exist.** Scaffolded blocks from SLICE 2 produce:
- `<slug>.block.md`
- `<slug>.tools.ts`
- `<slug>/subscriptions/*.ts` (when reactive)
- `tests/unit/blocks/<slug>.spec.ts`

Zero admin surface files. Builders who scaffold a block must hand-write `app/(dashboard)/<slug>/page.tsx` + any related components.

**Verdict:** this is the largest NEW code area for SLICE 4. Even a minimal bridge (auto-generate `page.tsx` + `table.tsx` + `create-form.tsx` from BlockSpec) is ~250 LOC new + template rendering.

### 3.8 Summary of what SLICE 4 does + doesn't need to build

| Surface | Status | SLICE 4 action |
|---|---|---|
| shadcn/ui | Installed + 30 components | Use as-is; install 0-3 missing (command, calendar, skeleton) |
| Tailwind + tokens | Robust | Typed wrapper; no token rewrites |
| Design tokens CSS | 100 LOC | Keep; add typed TS exports |
| Admin layout shell | 813 LOC | Keep; no changes |
| Customer magic-link auth | Shipped | Keep; no changes |
| Workspace theme data | Shipped | Keep; add typed read API + admin theming |
| Admin UIs (13 blocks) | Hand-authored drift | Ship new composition patterns; blocks migrate opportunistically |
| Customer-facing pages | 4 route classes | Ship `<CustomerShell>` unifier |
| Scaffold → UI bridge | Missing | **NEW: largest net-new code** |
| Composition pattern library | Missing | **NEW: 8 patterns** |

---

## 4. Quality bar (per Max's directive)

This is the **first demo-visible slice**. Quality standard is higher than invisible primitives (SLICE 1-3 ship runtime + schemas; users never see them). SLICE 4 ships pixels.

**References:**
- **shadcn/ui's own aesthetic** — restraint, token-driven, accessible defaults.
- **Twenty CRM** — CRM admin pattern inspiration (activity timeline, custom objects, inline edit).
- **Cal.com** — booking widget pattern.
- **Linear** — command palette, keyboard-first navigation, table density.
- **Existing SeldonFrame blocks** — the CRM surface is the current quality floor; SLICE 4 must at least match it.

**Quality gates at PR close:**

1. Every new component renders without console warnings in dev mode.
2. Every component is accessible: keyboard navigation, ARIA labels on interactive primitives, focus-visible states.
3. Dark mode works for every admin component; light mode works for every customer component.
4. Components compose without z-index / portal conflicts.
5. Motion is restrained — use existing `transitionTimingFunction.premium` + `transitionDuration.fast/normal/slow`.
6. No new custom fonts. Use Geist (already loaded).
7. No inline styles outside theme application. All styling through Tailwind utilities + design tokens.
8. Storybook / visual-regression suite is OUT OF SCOPE for this slice (adds multi-day tooling setup) — manual QA checklist in the close-out report instead.

---

## 5. Scaffold → UI bridge (largest net-new surface)

When a builder runs `pnpm scaffold:block`, the scaffold should optionally emit admin surface files alongside the existing `BLOCK.md + tools.ts + subscriptions/ + tests`. Files generated:

```
packages/crm/src/app/(dashboard)/<slug>/
  page.tsx              # list view wrapping <EntityTable>
  [id]/page.tsx         # detail view wrapping <EntityDetail>
  new/page.tsx          # create form wrapping <EntityForm>
packages/crm/src/components/<slug>/
  <slug>-table.tsx      # configured EntityTable
  <slug>-form.tsx       # configured EntityForm
```

Generation is DRIVEN BY BlockSpec:
- `tools.args` → form fields (via existing Zod schemas from tools.ts).
- `produces` event names → default verb buttons ("Create note", "Add vehicle").
- Block slug → page title + URL path.

The bridge LIVES IN `lib/scaffolding/render/admin-ui/` alongside existing renderers (block-md.ts, tools-ts.ts). Opt-in via `--emit-admin-ui` flag on the CLI.

**Why opt-in:** some blocks are pure-backend (subscription-only, scheduled triggers) and don't need an admin UI. Forcing generation would create orphan pages.

---

## 6. L-17 LOC estimate with CORRECTED methodology

### 6.1 Methodology applied

Per Max's directives for this audit:
- **First UI-heavy slice** — conservative upper bounds.
- **Component files:** 80-200 LOC each. Midpoint 140.
- **Component test surface:** 2-3x production per component. Using 2.5x (middle).
- **L-17 dispatcher-count addendum (from SLICE 3)** — compositions are dispatcher-analogous: each has its own schema/prop-surface + guard/type + test coverage. Apply the multi-component scaling axis.
- **Artifact categories** (separately counted): SKILL.md extension, scaffolded example outputs, composition integration harness.

### 6.2 Table

| Component class | Count | Prod LOC/unit | Prod total | Tests LOC/unit (2.5x) | Tests total |
|---|---|---|---|---|---|
| Admin composition patterns | 5 | 160 | 800 | 400 | 2,000 |
| Customer composition patterns | 3 | 170 | 510 | 425 | 1,275 |
| Typed design-token wrapper | 1 | 80 | 80 | 120 | 120 |
| Theme bridge (admin) | 1 | 60 | 60 | 100 | 100 |
| Scaffold → UI bridge | 1 | 300 | 300 | 450 | 450 |
| **Subtotals** | | | **1,750** | | **3,945** |

Artifact categories:
- Composition integration harness (8 scenarios × 30 LOC each + runner 100): **~340 LOC**
- Scaffold → UI example output (one block fully scaffolded w/ admin UI committed, ~150 LOC) + SKILL.md extension (~80 LOC): **~230 LOC**

**Grand total: ~6,265 LOC.**

### 6.3 Comparison to rescope-message estimate

Rescope message said: **2,500-4,000 LOC, 3 PRs**.

§6.2 projects **~6,265 LOC** — 57% above the rescope upper bound.

Drivers of the difference:
1. **2.5x test multiplier** on UI components (rescope message pre-dated the L-17 UI calibration).
2. **Scaffold → UI bridge** wasn't explicitly priced in the rescope message.
3. **Typed token wrapper + admin theme bridge** weren't in the rescope's 3-PR split.

### 6.4 Stop-and-reassess trigger

Applying the +30% architectural ceiling: **~8,145 LOC trigger.**

Per the L-17 audit-time-trigger addendum: if the re-estimate materially exceeds the 4,000 LOC rescope upper bound (it does — +57%), force a decision BEFORE implementation.

**Decision needed (see §8 G-4-1 through G-4-3):** scope-cut to land inside the rescope envelope, or expand the envelope with documented rationale.

### 6.5 L-17 calibration note for this audit

Estimates in this audit are using the **post-SLICE-3 corrected methodology** — dispatcher-count + artifact categories + explicit multipliers. SLICE 3 shipped at ~3,519 LOC vs 1,350 audit projection (+160%); SLICE 2 PR 1 shipped at ~2,725 LOC vs 2,350 audit projection (+16%). Applying those overshoot patterns to this audit's ~6,265 projection, the **realistic actual** is probably in the 6,300-7,500 LOC range.

The UI surface has tests that are genuinely different from dispatcher tests — they're render + prop + snapshot, not semantic + error-branch. The 2.5x multiplier may over- or under-estimate by another 20-30% either way. No prior UI data to calibrate.

---

## 7. Proposed PR split

Per Max: "may be more than 3 if the work wants 4 or 5."

### 7.1 PR 1 — Composition foundation (~1,400 LOC)

Scope:
- Typed design-token wrapper (`lib/ui/tokens.ts`) + TS exports mirroring CSS vars.
- 2 admin composition patterns: `<PageShell>` + `<EntityTable>` (enough to refactor one existing block as a smoke test).
- Refactor ONE existing block surface (e.g., `activities` — currently the smallest/simplest) to use the new patterns as the proof artifact.
- Shadcn component install: any of `command / calendar / skeleton` missing.
- Component tests for the 2 patterns + refactor smoke tests.
- Theme bridge (admin) — admin surface becomes OrgTheme-aware.

**Estimate:** ~1,350 LOC (300 prod + 750 tests + ~300 refactor). Runs well below the rescope PR cap.

### 7.2 PR 2 — Remaining admin patterns + customer shell (~1,800 LOC)

Scope:
- Remaining 3 admin patterns: `<EntityForm>`, `<EntityDetail>`, `<EntityKanban>`.
- `<CustomerShell>` customer-facing layout unifier.
- Migrate 2 existing customer routes (booking OR intake OR landing) to `<CustomerShell>`.
- Tests per pattern.

**Estimate:** ~1,800 LOC (600 prod + 1,200 tests).

### 7.3 PR 3 — Customer patterns + scaffold → UI bridge (~2,000 LOC)

Scope:
- `<BookingWidget>` + `<IntakeForm>` customer patterns (the remaining 2 of 3).
- Scaffold → UI bridge: new `--emit-admin-ui` CLI flag, `lib/scaffolding/render/admin-ui/` renderers, SKILL.md extension.
- Scaffold example output: one block fully regenerated with admin UI, committed byte-for-byte (mirrors SLICE 2 C7's `notes` block).

**Estimate:** ~2,000 LOC (700 prod + 1,100 tests + ~200 artifacts).

### 7.4 PR 4 — Integration harness + polish + close-out (~1,100 LOC)

Scope:
- Composition integration harness: 8 scenarios × per-pattern render tests + aggregate readability metrics.
- Manual QA checklist document for demo readiness.
- Dark/light mode verification across every pattern.
- Accessibility sweep (keyboard + focus + ARIA).
- 9-probe regression + close-out report + push.

**Estimate:** ~1,100 LOC (100 prod + 700 tests/harness + ~300 close-out artifacts).

### 7.5 Total: 4 PRs projected

Sum: 1,350 + 1,800 + 2,000 + 1,100 = **~6,250 LOC.** Matches §6.2 estimate.

**Why 4 PRs not 3:** the rescope message's 3-PR estimate didn't explicitly include the scaffold→UI bridge OR the composition integration harness. Separating them into PR 3 and PR 4 keeps each PR reviewable + testable independently.

---

## 8. Gate items — OPEN

### G-4-1 — Scope envelope decision

**Context:** audit projects ~6,250 LOC, 57% above the rescope message's 4,000 LOC upper bound.

**Option A:** Accept the expanded envelope. Rationale: rescope pre-dated the L-17 UI calibration + didn't explicitly price the scaffold→UI bridge. Ship all 4 PRs at projected LOC.

**Option B:** Scope-cut to fit the original envelope.
- B-1: drop the scaffold→UI bridge (defer to follow-up slice). Saves ~900 LOC. Final ~5,350.
- B-2: drop the 3 customer-facing patterns (defer to follow-up). Saves ~1,700 LOC. Final ~4,550.
- B-3: ship 5 admin patterns only; defer customer + scaffold bridge. Saves ~2,600 LOC. Final ~3,650.

**Option C:** Hybrid — ship PR 1 + PR 2 (admin patterns + theme bridge) as SLICE 4 proper. Split scaffold→UI and customer patterns into a follow-up SLICE 4b.

**Audit recommendation:** Option A. The scaffold→UI bridge is the primary builder-facing payoff of the slice — scaffolding without admin UI generation is half-done. Customer-facing patterns without scaffold→UI means two builder-visible gaps. A and C both ship the full vision; A is simpler.

**Decision needed:** A / B-1 / B-2 / B-3 / C.

### G-4-2 — Scaffold → UI bridge opt-in vs automatic

**Option A:** Opt-in via `--emit-admin-ui` CLI flag. Builders explicitly request it.

**Option B:** Automatic by default; `--no-admin-ui` opts out. Most scaffolded blocks are user-visible so this is the common case.

**Audit recommendation:** Option B (automatic). Mirrors the SKILL.md G-4 tier 2 default-with-TODO posture: generate sensible defaults + let builders grep TODO markers if they want to strip UI.

**Decision needed:** A or B.

### G-4-3 — Existing block UI migration

**Option A (opportunistic):** existing hand-authored block UIs are NOT migrated to new composition patterns in this slice. They continue working. Each block migrates opportunistically (when someone touches it for another reason).

**Option B (PR 1 proof migration):** one existing block (`activities` proposed) is migrated to `<PageShell> + <EntityTable>` in PR 1 as a proof artifact + visual reference. Other blocks remain opportunistic.

**Option C (systematic migration):** all 13 block surfaces migrated to the new patterns as part of SLICE 4. Massive scope — adds 1,500-2,500 LOC alone. Not recommended without separate sprint.

**Audit recommendation:** Option B. One proof migration validates the patterns work on real data; staying opt-in for the rest keeps scope contained.

**Decision needed:** A, B, or C.

### G-4-4 — Typed design-token wrapper scope

**Option A:** mirror CSS var names as TS constants. `tokens.background`, `tokens.primary`, etc. No invariants beyond "name matches".

**Option B:** richer API — `tokens.color(role: "primary" | "accent" | ...)`, `tokens.spacing(n: 0 | 1 | 2 | 4 | 6 | 8)`, `tokens.shadow(kind: "card" | "modal" | ...)`. Enforces structured usage.

**Audit recommendation:** Option B. L-22 structural enforcement: functions > raw strings. Prevents typos at compile time + gives centralized override points.

**Decision needed:** A or B.

### G-4-5 — Customer-facing auth surface

Context: magic-link auth is shipped (§7.5). The UI side exists as `portal/[orgSlug]/login/page.tsx` (15 LOC — minimal).

**Option A:** leave the auth UI as-is. SLICE 4 customer patterns (`<BookingWidget>`, `<IntakeForm>`) don't need auth; the portal has its own flow.

**Option B:** ship a themed `<CustomerLogin>` component that the portal's login page adopts. Small LOC (~100) + aligns the authenticated-customer entry with SLICE 4's theming.

**Audit recommendation:** Option B if PR budget permits (~100 LOC in PR 3 addition). Option A if not.

**Decision needed:** A or B (contingent on G-4-1 decision).

### G-4-6 — Composition integration harness depth

Option A (deep): 8 scenarios × full render assertion + snapshot + accessibility probe. ~500 LOC harness.

Option B (shallow): 8 scenarios × render-without-crash + primary interaction test. ~300 LOC harness.

**Audit recommendation:** Option B. First UI slice; shallow coverage is enough to catch regressions. Deep accessibility tooling (axe-core integration, contrast probing) can follow in a polish slice.

**Decision needed:** A or B.

---

## 9. Out of scope

- **Storybook / Chromatic / visual-regression tooling.** Multi-day infra work; not the primitive ship.
- **New fonts / custom typography beyond the existing 6 OrgTheme fontFamily options.**
- **Customer auth refactor** — magic-link auth is shipped; no changes to the mechanism.
- **Systematic migration of all 13 existing block UIs** — opportunistic only (G-4-3).
- **Mobile-first redesign** — existing surfaces are responsive; SLICE 4 preserves but doesn't overhaul.
- **White-label customer domains** — beyond OrgTheme. Separate SLICE.
- **Rich-text editing, file upload primitives** — deferred. Use existing Puck where Puck is already in.
- **Analytics / metrics inside composition patterns** — deferred.
- **Marketing-site (homepage) redesign** — `(public)/page.tsx` is out of scope.

---

## 10. Dependencies

- **Hard:** SLICE 2 block scaffolding (shipped at `225a423f` / `bc646a84`). Scaffold → UI bridge extends the existing CLI.
- **Hard:** shadcn/ui + Tailwind v4 + design tokens (shipped pre-Scope-3).
- **Hard:** magic-link auth (shipped). No version coupling; SLICE 4 references current API.
- **Hard:** `OrgTheme` schema (shipped). Stable surface.
- **Independent** of SLICE 1 subscription primitive.
- **Independent** of SLICE 3 state-access step types.

---

## 11. End-to-End Flow continuity (per Max's §8 requirement)

### 11.1 Scaffolded blocks gain admin UIs automatically (G-4-2 contingent)

When a builder runs:
```bash
pnpm scaffold:block --spec vehicle-service-history.json --edit-events-union
```

And G-4-2 resolves to Option B (automatic): the scaffold ALSO emits:
- `app/(dashboard)/vehicle-service-history/page.tsx` → wraps `<EntityTable>`.
- `app/(dashboard)/vehicle-service-history/new/page.tsx` → wraps `<EntityForm>`.
- `components/vehicle-service-history/table.tsx` + `form.tsx` → per-block wrappers.

All rendered with workspace theme applied via the admin theme bridge.

### 11.2 Scaffolded blocks gain customer-facing UIs when applicable

Out of scope for this slice. `<BookingWidget>` and `<IntakeForm>` are currently tied to specific block types (caldiy-booking + formbricks-intake); generalized customer-facing scaffolding is a future slice.

### 11.3 Workspace branding propagation

Flow post-SLICE-4:
1. Builder edits workspace theme in `/settings/theme` (existing `theme-settings-form.tsx`).
2. `OrgTheme` saved to `organizations.soul.branding`.
3. Admin pages: new theme bridge loads theme on layout → applies via CSS vars → every shadcn component picks up colors automatically.
4. Customer pages: existing `public-theme-provider.tsx` path (unchanged from today).

### 11.4 Magic-link auth integration

Flow unchanged from today (§7.5). SLICE 4 optionally adds `<CustomerLogin>` component (G-4-5) — the login PAGE uses it, auth mechanism is untouched.

---

## 12. Reference

### 12.1 Builds on SLICE 2 scaffolding

- `packages/crm/src/lib/scaffolding/render/*` — existing template renderers. Bridge adds `admin-ui/` subdirectory with page-renderer + component-renderer.
- `packages/crm/src/lib/scaffolding/spec.ts` — BlockSpec interface. Bridge reads `tools` + `produces` fields.
- CLI wrapper (`scripts/scaffold-block.js` + `.impl.ts`) — bridge adds `--emit-admin-ui` flag + wiring.

### 12.2 Informs future SLICE 9 (worked example + composability validation)

SLICE 9 ships a full worked demo exercising the primitive stack end-to-end. SLICE 4 gives it the UI — without SLICE 4, SLICE 9 would be CLI-only.

### 12.3 Informs future "SLICE 4b" polish

If G-4-1 resolves to Option C (split), the second half becomes SLICE 4b. Otherwise SLICE 4 is self-contained and SLICE 5 (scheduled triggers) follows.

---

## 13. Stop-gate

**AUDIT ONLY.** No code until:
- G-4-1 through G-4-6 all resolve (§8).
- Max confirms LOC envelope decision per G-4-1.
- Ground-truth §3 acknowledged, including the magic-link auth already-shipped finding (reduces original supporting-primitives scope).
- Quality bar §4 acknowledged.

**Expected revision rounds: 1-2.** Highest-leverage decision is G-4-1 (scope envelope).

---

## 14. Self-review changelog (2026-04-23, pre-approval)

- §3.5 surfaces magic-link auth as ALREADY SHIPPED — reduces SLICE 4 scope vs the rescope message's assumption.
- §3.7 surfaces scaffold → UI bridge as the LARGEST net-new code area.
- §6 applies the post-SLICE-3 corrected L-17 methodology: 2.5x UI test multiplier + dispatcher-count scaling on the 8 composition patterns. Projection ~6,265 LOC.
- §6.3 explicitly notes the ~57% overrun vs the rescope message's 4,000 LOC upper bound. Forces G-4-1 decision at audit time per L-17 audit-time-trigger addendum.
- §6.5 acknowledges UI LOC calibration data doesn't yet exist. The 2.5x multiplier is a first estimate; SLICE 4 close-out will produce calibration evidence.
- §7 proposes 4 PRs instead of the rescope's 3 — the scaffold→UI bridge + composition harness each deserve their own PR for review focus.
- §11 end-to-end flow per Max's §8 requirement.
- §4 quality bar explicit — shadcn aesthetic, Twenty/Cal/Linear references, 8 quality gates for PR close.

**Open self-critique:** UI LOC estimates are the weakest part of this audit. Without prior UI-heavy slice data, the 2.5x multiplier is informed guess, not calibrated pattern. SLICE 4 close-out will generate the first UI calibration data point.
