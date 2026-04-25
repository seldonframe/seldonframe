# SLICE 4 — Unified UI composition layer: audit

**Draft:** 2026-04-23
**Sprint:** Scope 3 rescope, SLICE 4 of 9 (primitive-completion)
**Status:** APPROVED 2026-04-23. Split per G-4-1 into **SLICE 4a (this audit) + SLICE 4b (drafted post-4a close)**.
**Inputs:** Scope 3 rescope message (2026-04-22), `tasks/lessons.md` L-15 through L-22 + all L-17 addenda (incl. the SLICE 3 dispatcher-count rule), SLICE 1/2/3 audits + close-outs.

**Scope split (G-4-1 Option C resolved):**
- **SLICE 4a:** admin composition patterns + scaffold → UI bridge + proof migration. Estimated ~3,350-4,000 LOC; stop-trigger 5,200. Three PRs.
- **SLICE 4b:** customer-facing patterns + BookingWidget / IntakeForm migrations + customer auth surface + deeper integration harness. Audit drafted AFTER 4a ships, using empirical UI-multiplier data from 4a PR 1's calibration checkpoint (§11).

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

### 2.1 Admin patterns (5) — SLICE 4a

Aligned with Max's gate-resolution naming:

| Pattern | Purpose | Shadcn primitives it composes | Approx LOC |
|---|---|---|---|
| `<PageShell>` + `<BlockListPage>` | Admin list-page wrapper: title + breadcrumbs + actions + filter bar. `BlockListPage` = `PageShell` wrapping an `<EntityTable>` with sensible defaults for a block's primary entity. | button + separator + dropdown + table + input | 220 |
| `<EntityTable>` | Tabular list primitive — auto-derives columns from the entity's Zod schema. Sort, filter, pagination, row-select. Used inside `BlockListPage` and standalone. | table + input + button + select + dropdown | 200 |
| `<BlockDetailPage>` | Admin detail-page wrapper: breadcrumb + entity-title + action bar + tabbed content area. Wraps `<CompositionCard>` panels. | tabs + card + button + separator | 170 |
| `<EntityFormDrawer>` | Create/edit form in a side-sheet drawer. Auto-derives fields from Zod schema; honors `required` / `nullable`. | sheet + input + select + textarea + button | 200 |
| `<ActivityFeed>` | Activity timeline (mirrors `components/crm/activity-timeline.tsx` pattern, generalized). Grouping by day, avatar, action + target summary. | scroll-area + avatar + card | 160 |
| `<CompositionCard>` | Generic card primitive for detail-page sections. Title + optional badge + content slot + optional action row. Replaces the ad-hoc card wrappers in hub/dashboard/crm surfaces. | card + badge + button | 100 |

**Total admin primitives:** ~1,050 LOC production.

Note: `<PageShell>` + `<BlockListPage>` are counted as one primitive because `BlockListPage` is a typed preset of `PageShell`. They ship as one module with two entry points.

### 2.2 Customer-facing patterns — **DEFERRED TO SLICE 4b**

Per G-4-1 Option C, these 3 patterns move to SLICE 4b. Included here as a scope marker — the audit draft is frozen at estimate level; concrete 4b audit runs after 4a close with empirical UI-multiplier data.

| Pattern | Purpose | Approx LOC |
|---|---|---|
| `<PortalLayout>` / `<CustomerShell>` | Customer-facing layout with brand applied | ~120 |
| `<CustomerDataView>` | Read-only data display for customer portal — activity feed, resources, messages | ~200 |
| `<CustomerActionForm>` | Themed form for customer-initiated actions (booking creation, intake submission) | ~230 |

**Estimated 4b total:** ~2,265 LOC (will refine post-4a with UI calibration data).

See §12 "SLICE 4b deferred scope" for the full 4b frame.

### 2.3 Supporting primitives — SLICE 4a

| Component | Purpose | Approx LOC |
|---|---|---|
| Typed design-token wrapper (functional API per G-4-4) | `tokens.color.primary()`, `tokens.space("md")`, `tokens.shadow("card")`, `tokens.radius("md")`. L-22 structural enforcement: typos caught at typecheck. | 120 |
| Admin theme bridge | Apply OrgTheme to admin surface (existing public-theme-provider covers customer-only today) | 80 |
| Scaffold→UI bridge | Generate admin page + component stubs from BlockSpec. Automatic-default per G-4-2. | 300 |
| Composition test harness (shallow per G-4-6) | Render smoke + theme-flow + scaffold-mount smoke tests | ~100 (test) |

**Total supporting:** ~500 LOC production.

### 2.4 SLICE 4a totals

| Class | Prod LOC | Tests LOC (2.5x) |
|---|---|---|
| Admin patterns (§2.1) | 1,050 | 2,625 |
| Supporting primitives (§2.3) | 500 | 750 |
| **Subtotal** | **1,550** | **3,375** |

Plus artifact categories:
- Shallow integration harness: ~100 LOC artifact
- CRM proof migration (modifies existing files, new LOC ~150)
- SKILL.md scaffold-UI extension: ~60 LOC

**SLICE 4a total projection: ~5,235 LOC.**

This exceeds Max's "~3,350-4,000" estimated envelope. The 2.5x UI multiplier drives the difference — SLICE 4a PR 1 will produce the first calibration data point (§11) and may revise downward if the multiplier runs lower in practice.

**Stop-and-reassess trigger (Max-set):** 5,200 LOC. Audit projection is ~35 LOC below trigger — right at the edge. §11 calibration is load-bearing for deciding whether to continue past PR 1.

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

**Quality gates at PR close (expanded per Max's gate decisions):**

Display + layout:
1. **Typography reads correctly** — consistent scale (page-title → section-title → card-title → body → label → data → tiny), consistent line heights, no ad-hoc text sizes.
2. **Spacing consistent** — no ad-hoc pixel values. All spacing from the token scale via the typed functional API (`tokens.space("sm" | "md" | "lg")`).
3. **Mobile breakpoints functional** — components don't break below the current responsive minimum (sm breakpoint = 640px). Not a mobile-first redesign; just "doesn't visibly break."
4. Components compose without z-index / portal conflicts.

States:
5. **Empty states with intentional copy + CTAs** — every list / feed / table has a non-empty empty state, not a blank area.
6. **Loading states as skeletons, not spinners** — use the `skeleton-shimmer` animation already in `tailwind.config.ts`.
7. **Error states distinguishable from empty states** — different visual + copy.

Technical:
8. Every new component renders without console warnings in dev mode.
9. Keyboard navigation + ARIA labels on interactive primitives + focus-visible states.
10. Dark + light mode work.
11. Motion restrained — use existing `transitionTimingFunction.premium` + `transitionDuration.fast/normal/slow`.
12. No new custom fonts. Geist is loaded.
13. No inline styles outside theme application.

Out of scope for SLICE 4a:
- Storybook / Chromatic / visual-regression tooling.
- Full WCAG audit. Keyboard + ARIA + focus are enforced; automated axe-core integration is post-launch.
- Visual snapshot testing.

Manual QA checklist ships in PR 3 close-out (per G-4-6 shallow harness).

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

## 7. PR split — SLICE 4a (3 PRs)

### 7.1 PR 1 — Foundation + proof migration (~1,350 LOC)

Scope:
- Typed design-token wrapper (`lib/ui/tokens.ts`) — functional API per G-4-4.
- Admin theme bridge — workspace OrgTheme flows to admin surfaces.
- `<PageShell>` + `<BlockListPage>` pattern.
- `<EntityTable>` pattern — auto-derives columns from Zod schemas.
- **CRM block admin UI migrated to new patterns** (G-4-3 proof migration) — the reference validation.
- Shadcn component install: add `command` + `skeleton` if missing (check at PR kickoff).
- Unit + component tests per 2.5x UI multiplier (will calibrate at PR 1 close per §11).

**Est. LOC:** ~1,350 (300 prod + 750 tests + ~300 CRM refactor).
**Stop-and-reassess trigger PR 1:** 1,750 LOC (30% over).

### 7.2 PR 2 — Remaining patterns + scaffold → UI bridge (~2,500 LOC)

Scope:
- `<BlockDetailPage>` — admin detail wrapper.
- `<EntityFormDrawer>` — side-sheet create/edit form.
- `<ActivityFeed>` — generalizes `components/crm/activity-timeline.tsx`.
- `<CompositionCard>` — generic detail-page card primitive.
- Scaffold → UI bridge (G-4-2 automatic-default): `lib/scaffolding/render/admin-ui/` renderers + CLI detection heuristic + `--no-admin-ui` opt-out.
- SKILL.md extension documenting the admin-UI generation behavior.
- Component tests per each pattern.

**Est. LOC:** ~2,500 (700 prod + 1,600 tests + ~200 scaffold-bridge code + ~80 SKILL + ~50 artifacts).

Contingent on §11 calibration: if PR 1's actual UI multiplier diverges materially from 2.5x, this estimate is revised before PR 2 starts.

### 7.3 PR 3 — Integration harness + QA + close-out (~1,400 LOC)

Scope:
- Shallow composition integration harness (G-4-6): 5 pattern smoke tests + 2 scaffold-bridge smoke tests.
- Scaffold-bridge artifact: one block regenerated with admin UI, committed byte-for-byte.
- Manual QA checklist document (markdown) for preview-URL visual verification.
- Dark/light mode sweep across all 5 patterns.
- Keyboard + focus sweep.
- 9-probe regression probes.
- Close-out report with **UI Multiplier Calibration Analysis** (per §11) — the first UI LOC data point for future audits.

**Est. LOC:** ~1,400 (100 prod + 700 harness + ~600 close-out artifacts + scaffold example).

### 7.4 Total: 3 PRs

Sum: 1,350 + 2,500 + 1,400 = **~5,250 LOC.** Matches §2.4 projection (5,235) within 0.3%.

**Stop-trigger for the slice:** 5,200 LOC per Max's gate-resolution message. Projection is 50 LOC over. §11 calibration is load-bearing for whether PR 2 stays at 2,500 or adjusts.

---

## 8. Gate items — all APPROVED 2026-04-23

### G-4-1 — APPROVED: Option C (hybrid split into SLICE 4a + 4b)

**Rationale:** 6,265 LOC projection is two slices worth of work. Natural seam between admin patterns + scaffold bridge (4a) and customer-facing patterns + migrations (4b). Splitting lets each unit ship with focused attention, produces UI calibration data from 4a that improves 4b's estimation, honors audit-time trigger discipline without forcing quality cuts.

**SLICE 4a = admin + scaffold bridge.** Estimate refined per §2.4: ~5,235 LOC (with stop-trigger 5,200 — right at the edge; §11 calibration is load-bearing).

**SLICE 4b = customer-facing + deeper integration.** Audit drafted AFTER 4a ships with empirical UI multiplier data. Estimate ~2,265 LOC (will refine with 4a data).

### G-4-2 — APPROVED: Scaffold → UI automatic default with smart skip

**Resolution:** scaffold generates admin UI files automatically when the block has primary entities + CRUD tools. Skips UI generation for blocks with no user-facing entities (subscription-only, scheduled-triggers-only). Builders can delete or customize generated files.

**Detection heuristic (proposed; refine during PR 2):**
- Generate admin UI when: spec has ≥1 tool with `emits` OR ≥1 tool that appears to be CRUD-shaped (name starts with `create_` / `list_` / `get_` / `update_` / `delete_`).
- Skip when: spec has only subscription handlers and zero primary tools.

Fall-through: when in doubt, generate. Easier to delete than to discover missing files.

`--no-admin-ui` CLI flag opts out when the heuristic guesses wrong.

### G-4-3 — APPROVED: Proof-only migration — CRM block as the reference

**Resolution:** migrate ONE block (**CRM** — the most complex existing admin UI, per Max) in PR 1 as pattern validation + visual reference. Systematic migration of the remaining 12 blocks becomes a follow-up ticket (not a separate audited slice).

**Why CRM over the originally-proposed `activities`:** CRM exercises every pattern at scale — multiple entity types (contacts, deals, activities, custom objects), the activity timeline (which becomes `<ActivityFeed>` in PR 2), rich detail pages (become `<BlockDetailPage>` in PR 2). Proving patterns work on CRM validates them for every smaller block automatically.

**Follow-up ticket:** `tasks/follow-up-block-ui-migration.md` captures the 12 remaining blocks + estimated ~1,500-2,500 LOC of migration work. Not in SLICE 4a / 4b scope.

### G-4-4 — APPROVED: Typed functional API

**Resolution:** `tokens.color.primary()`, `tokens.space("md")`, `tokens.shadow("card")`, `tokens.radius("md")` — every call is a typed function. Typos caught at `tsc --noEmit`. Centralized override points for future theme work.

**Why not the mirror-CSS-vars approach:** raw string constants like `tokens.background` don't prevent `tokens.backgrund` typos. Functional API exposes arg-literal enums → typos fail typecheck. L-22 structural enforcement applied.

**Implementation sketch:**
```ts
// lib/ui/tokens.ts
type ColorRole = "primary" | "accent" | "secondary" | "muted" | "card" | "destructive" | ...;
type SpaceStep = "xs" | "sm" | "md" | "lg" | "xl";
type ShadowKind = "card" | "modal" | "dropdown" | "xs" | "sm";
type RadiusStep = "sm" | "md" | "lg" | "xl";

export const tokens = {
  color: (role: ColorRole) => `var(--${role})`,
  space: (step: SpaceStep) => `var(--space-${step})`,
  shadow: (kind: ShadowKind) => `var(--shadow-${kind})`,
  radius: (step: RadiusStep) => `var(--radius-${step})`,
};
```

Consumers pass the result as a Tailwind arbitrary value: `className={`bg-[${tokens.color("primary")}]`}`. Or (preferred) via a helper wrapper: `className={bg(tokens.color("primary"))}`. PR 1 picks the ergonomic shape.

### G-4-5 — DEFERRED to SLICE 4b

Customer auth surface is customer-facing work, belongs in 4b alongside `<PortalLayout>` / `<CustomerShell>`. 4a explicitly does not modify `portal/[orgSlug]/login/page.tsx`.

### G-4-6 — APPROVED: Shallow harness for SLICE 4a

**Resolution:** smoke tests — patterns render without crash, theme flows through via CSS vars, scaffolded block UI mounts successfully on a representative BlockSpec. No interaction scripting, no axe-core accessibility audits, no visual snapshots.

**Deep harness deferred to post-launch** (as its own tooling slice or opportunistic polish). Tooling setup (Storybook, Chromatic, axe-core, Playwright) is multi-day work and not on the critical path for primitive completion.

**Harness scope in PR 3:**
- 5 smoke tests (one per admin pattern): component mounts, renders expected DOM landmarks, applies theme CSS vars.
- 2 scaffold-bridge smoke tests: scaffold a test block → admin UI files generated → `pnpm build` succeeds on the output.
- Manual QA checklist document in the close-out report for human visual verification at preview URL.

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

## 11. UI Test Multiplier Calibration Checkpoint

SLICE 4a is the first UI-heavy slice in the sprint. The 2.5x test multiplier used in §2.4 + §6 is informed by industry patterns but **not empirically validated** against SeldonFrame's own UI work.

**At PR 1 close**, compare actual test LOC vs audit projection for the PageShell + EntityTable + CRM proof migration components. Calculate the effective UI test multiplier:

```
effective_multiplier = actual_test_LOC / actual_prod_LOC
```

### 11.1 Decision rules

**Within ±15% of 2.5x** (i.e., 2.125x to 2.875x): proceed with PR 2 unchanged.

**Materially different (>15%)**:
1. Recalculate PR 2 and PR 3 estimates using the corrected multiplier.
2. If corrected total still lands ≤5,200 LOC (the stop trigger): proceed with PR 2, note recalibration in PR 1 close-out.
3. If corrected total exceeds the trigger: **stop → audit-time conversation → Max decides whether to accept or scope-cut**. L-21 discipline: stops are stops.

### 11.2 Artifacts

PR 1's close-out report ships a "**UI Multiplier Calibration Analysis**" section documenting:
- Actual PR 1 prod LOC per component + aggregate.
- Actual PR 1 test LOC per component + aggregate.
- Computed effective multiplier.
- Recalibrated PR 2 + PR 3 estimates if applicable.
- L-17 addendum proposal if the multiplier lands systematically off (e.g., "UI components consistently run 3.5x test multiplier, not 2.5x — update the three-level spectrum").

### 11.3 Why this matters beyond SLICE 4a

The first empirical UI LOC data point calibrates:
- **SLICE 4b audit** — customer-facing patterns estimated using the validated multiplier.
- **Future UI work** — scaffolding UI improvements, post-launch polish slices.
- **The L-17 addendum set** — currently captures dispatcher-heavy slices (SLICE 3) + artifact categories (SLICE 2+). SLICE 4a adds the UI-component axis.

Skipping the calibration checkpoint means SLICE 4b re-runs the SLICE 3 overshoot problem — audit estimates based on unvalidated multipliers. L-20 ground-truth + L-17 calibration are both about replacing guesses with evidence.

---

## 12. SLICE 4b deferred scope

Documented here so nothing is lost between SLICE 4a close and SLICE 4b audit kickoff.

### 12.1 In SLICE 4b scope

| Component / surface | Reason deferred |
|---|---|
| `<PortalLayout>` / `<CustomerShell>` | Customer-facing layout unifier. Scope-split to land with other customer work. |
| `<CustomerDataView>` | Customer portal data display (activity feed, resources, messages). |
| `<CustomerActionForm>` | Themed form for customer-initiated actions (booking, intake). |
| `<BookingWidget>` migration | Move existing `book/[orgSlug]/[bookingSlug]/page.tsx` to the composed `<CustomerShell>` + `<CustomerActionForm>` pattern. |
| `<IntakeForm>` migration | Move existing `forms/[id]/[formSlug]/page.tsx` similarly. |
| Customer auth surface (G-4-5 deferred) | Optional themed `<CustomerLogin>` wrapper. Portal auth mechanism unchanged. |
| Scaffold → Customer UI bridge extension | Scaffolded blocks with customer-facing surfaces (booking-shaped, intake-shaped) get customer UI files automatically. |
| Customer-facing integration harness | Shallow smoke tests mirroring 4a's harness, scoped to customer patterns. |

### 12.2 Estimate frame

**Current rough estimate:** ~2,265 LOC (using the un-calibrated 2.5x multiplier). Will refine with 4a data.

If 4a's calibrated multiplier runs higher (say 3.0x): 4b projection rises to ~2,600 LOC.
If lower (2.0x): falls to ~1,850 LOC.

### 12.3 Audit timing

Draft SLICE 4b audit **after** SLICE 4a's PR 3 close-out ships — the multiplier + the actual patterns exercised in 4a both inform 4b's design decisions. Drafting 4b now would be re-running the pre-calibration estimation error.

### 12.4 Dependencies carried forward

SLICE 4b builds on SLICE 4a's:
- Typed design-token API (`lib/ui/tokens.ts`).
- Admin theme bridge pattern → becomes the template for customer theme improvements.
- 5 admin patterns (some compose directly — `<CompositionCard>` reusable in customer surfaces).
- Scaffold → UI bridge architecture → extend for customer-facing generation.

**Zero customer-facing code** ships in 4a. Portal login, booking widget, intake form, landing pages all remain exactly as they are post-4a close.

---

## 13. End-to-End Flow continuity (per Max's §8 requirement)

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

## 14. Reference

### 14.1 Builds on SLICE 2 scaffolding

- `packages/crm/src/lib/scaffolding/render/*` — existing template renderers. Bridge adds `admin-ui/` subdirectory with page-renderer + component-renderer.
- `packages/crm/src/lib/scaffolding/spec.ts` — BlockSpec interface. Bridge reads `tools` + `produces` fields.
- CLI wrapper (`scripts/scaffold-block.js` + `.impl.ts`) — bridge wires the automatic-default generation (G-4-2) + `--no-admin-ui` opt-out.

### 14.2 Informs SLICE 4b

See §12 for full scope. Calibration data from 4a PR 1 (§11) refines 4b's LOC estimates.

### 14.3 Informs future SLICE 9 (worked example + composability validation)

SLICE 9 ships a full worked demo exercising the primitive stack end-to-end. SLICE 4 (a + b combined) gives it the UI — without SLICE 4, SLICE 9 would be CLI-only.

### 14.4 Deferred follow-ups

- `tasks/follow-up-block-ui-migration.md` (to be written in SLICE 4a PR 3 close-out): the 12 remaining blocks that didn't get the CRM proof migration. ~1,500-2,500 LOC across the set. Opportunistic.

---

## 15. Stop-gate

**APPROVED 2026-04-23** for SLICE 4a. All six gates resolved (§8). Scope envelope accepted per G-4-1 Option C. LOC projection ~5,250, stop-trigger 5,200.

**PR 1 begins immediately after this audit revision commits + pushes.** Expected 3-6 mini-commits:
1. Typed design-token wrapper + tests
2. Admin theme bridge
3. `<PageShell>` + `<BlockListPage>` + tests
4. `<EntityTable>` + tests
5. CRM proof migration
6. PR 1 close-out + §11 calibration analysis

**Stop after PR 1 green bar + push + §11 calibration.** If multiplier materially off, audit-time conversation before PR 2. Otherwise proceed to PR 2.

---

## 16. Self-review changelog

**2026-04-23, pre-approval draft:**
- §3.5 surfaces magic-link auth as ALREADY SHIPPED — reduces SLICE 4 scope vs the rescope message's assumption.
- §3.7 surfaces scaffold → UI bridge as the LARGEST net-new code area.
- §6 applies the post-SLICE-3 corrected L-17 methodology: 2.5x UI test multiplier + dispatcher-count scaling on the 8 composition patterns. Projection ~6,265 LOC.
- §6.3 explicitly notes the ~57% overrun vs the rescope message's 4,000 LOC upper bound. Forces G-4-1 decision at audit time per L-17 audit-time-trigger addendum.
- §7 proposes 4 PRs instead of the rescope's 3 — the scaffold→UI bridge + composition harness each deserve their own PR for review focus.
- §4 quality bar explicit — shadcn aesthetic, Twenty/Cal/Linear references, 8 quality gates for PR close.

**Open self-critique:** UI LOC estimates are the weakest part of this audit. Without prior UI-heavy slice data, the 2.5x multiplier is informed guess, not calibrated pattern. SLICE 4 close-out will generate the first UI calibration data point.

**2026-04-23, post-gate-resolution revision (G-4-1 Option C):**
- §1 / title updated: audit is now SLICE 4a + 4b split. 4a is admin + scaffold bridge; 4b drafted after 4a close with empirical multiplier data.
- §2.1 admin pattern names aligned with Max's naming: `<PageShell>` + `<BlockListPage>`, `<BlockDetailPage>`, `<EntityFormDrawer>`, `<ActivityFeed>`, `<CompositionCard>`. Replaces the earlier generic `<EntityForm> / <EntityDetail> / <EntityKanban>` set.
- §2.2 customer patterns explicitly deferred to SLICE 4b with estimate frame + scope pointer.
- §2.4 added — SLICE 4a totals (~5,235 LOC projected). Notes that stop-trigger is 5,200 (Max-set) — 35 LOC margin makes §11 calibration load-bearing.
- §4 quality bar expanded per Max's additions — typography / spacing / empty states / loading as skeletons / error states / mobile breakpoints.
- §7 PR split: 3 PRs for 4a (Max's specified structure).
- §8 all gates resolved:
  - G-4-1: Option C (hybrid split into 4a + 4b)
  - G-4-2: scaffold → UI automatic-default with smart skip (heuristic on tool shape)
  - G-4-3: proof-only migration — CRM as the reference (not activities)
  - G-4-4: typed functional API (`tokens.color.primary()`)
  - G-4-5: DEFERRED to SLICE 4b
  - G-4-6: shallow harness for 4a
- §11 NEW: UI Test Multiplier Calibration Checkpoint. First empirical UI LOC data point from PR 1 close calibrates PR 2/3 + SLICE 4b estimates.
- §12 NEW: SLICE 4b deferred scope — full frame so nothing lost between 4a close and 4b audit.
- §13 → renumber of previous §11 End-to-End Flow.
- §14 Reference renumbered + updated subsections.
- §15 Stop-gate set to APPROVED with PR 1 mini-commit plan.
- §16 self-review changelog split into pre-approval + post-gate-resolution entries.
