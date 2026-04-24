# SLICE 4b Audit — customer-facing composition layer

**Date:** 2026-04-24
**Scope sprint:** post-SLICE-4a; second half of the unified UI composition layer (Option C split).
**Predecessor:** SLICE 4a (admin composition + scaffold bridge + L-17 calibration), closed in commit `8905fe1f`.
**Drafted by:** Claude Opus 4.7 against HEAD.

---

## §1 Problem statement + strategic context

SLICE 4a delivered admin composition primitives (7 patterns + scaffold → admin UI bridge + CRM proof migration). Admin surfaces now compose from a shared pattern library; scaffolded blocks auto-generate admin pages against declared entities.

SLICE 4b delivers the same story for **customer-facing surfaces** — the UIs end customers see (booking widgets, intake forms, portal views), not the UIs builders see (admin CRUD). Three motivations:

1. **Demo-visible launch surface.** The first 60 seconds of a new builder's experience crosses BOTH admin (install blocks, configure) AND customer-facing (preview the booking widget, see their own intake form). SLICE 4b lands the latter half of that loop.

2. **Trust asymmetry demands composition discipline.** Admin surfaces are seen by the builder themselves. Customer surfaces are seen by the builder's customers — a stranger visiting the workspace. Subtle visual regressions in admin are noise; the same regression in a public booking widget is brand damage. Composition primitives make the public surface consistent by construction.

3. **Scaffold bridge extension anchors the "builder NL → customer-facing page" pipeline.** SLICE 4a's bridge emits admin CRUD. SLICE 4b extends the same pattern to emit customer-facing routes — so a builder who NL-scaffolds a block gets BOTH an admin CRUD surface AND a customer-visible surface without hand-writing routes.

**Strategic boundary:** SLICE 4b is the LAST composition-layer slice before launch-readiness work (SLICE 5 scheduled triggers, SLICE 6 external-state branching, SLICE 7 message triggers). After 4b closes, the UI layer is feature-complete for v1; subsequent slices are workflow / Brain-layer capabilities that consume the UI patterns.

---

## §2 Ground-truth findings at HEAD

All five verification items confirmed via direct source inspection at commit `8905fe1f`.

### §2.1 BookingWidget — existing customer surface

- **File:** [`packages/crm/src/components/bookings/public-booking-form.tsx`](packages/crm/src/components/bookings/public-booking-form.tsx) — 285 LOC
- **Posture:** `"use client"` component; 2-step state machine
- **States:** `"pick-time"` (calendar + slot grid) → `"enter-details"` (name/email/notes form) → success (inline confirmation or Stripe checkout redirect)
- **State variables:** `step`, `selectedDate`, `selectedDateISO`, `selectedSlot`, `slots`, `slotsLoading`, `pending`, `success`, `confirmationMessage`, `timezone`
- **Dependencies:** `react-day-picker`, `sonner`, server actions `listPublicBookingSlotsAction` + `submitPublicBookingAction`
- **L-17 classification:** **1.7x (state-machine).** Multi-step transitions + async slot loading + success branching.

### §2.2 IntakeForm — existing customer surface

- **File:** [`packages/crm/src/components/forms/public-form.tsx`](packages/crm/src/components/forms/public-form.tsx) — 400 LOC
- **Posture:** `"use client"` component; progressive disclosure state machine
- **States:** `{ kind: "welcome" }` → `{ kind: "question", index }` × N → `{ kind: "done" }`
- **Input types:** text, email, tel, textarea, select (pill buttons ≤6 options, native `<select>` otherwise)
- **Interaction surface:** email-format validation, required-field enforcement, Enter-to-advance, Cmd+Enter on textarea, Esc-to-back, auto-focus on question mount, auto-advance on pill select
- **Dependencies:** `framer-motion` (`AnimatePresence` + `motion.div`), server action `submitPublicIntakeAction`
- **L-17 classification:** **1.8x-2.0x (state-machine, upper band).** Progressive-disclosure depth + per-field validation + animated transitions + keyboard-shortcut matrix. Highest complexity in either 4a or 4b's inventory.

### §2.3 Customer magic-link auth — SHIPPED as dual system

**Surprise flag:** auth is NOT "shipped as simple magic-link consumer of admin system." It's a **parallel, purpose-built OTC + JWT architecture:**

- **File:** [`packages/crm/src/lib/portal/auth.ts`](packages/crm/src/lib/portal/auth.ts) — 278 LOC
- **Primary flow (OTC):** 6-digit code delivered via email; `portalAccessCodes` table with hashed code + 15-min TTL; `verifyPortalAccessCodeAction` mints a JWT portal session (7-day TTL) stored in httpOnly cookie
- **Secondary flow (programmatic magic link):** `createPortalMagicLink(orgSlug, contactId)` skips OTC and directly mints a JWT — used by automation/invite contexts, not self-service
- **Routes present:** `/portal/[orgSlug]/login` (OTC form), `/portal/[orgSlug]/magic?token=...` (magic link callback), `/portal/[orgSlug]/(client)/*` (protected layout)
- **Current UI:** minimal unthemed OTC form — functional but doesn't use SLICE 4a's composition primitives OR the workspace's `PublicThemeProvider` consistently

**Implication for G-4b-1 (customer auth UX):** shipping a themed `<CustomerLogin>` using 4a patterns is genuinely tractable — the underlying auth plumbing already works; we're replacing the form chrome, not re-designing the flow.

### §2.4 Customer theme application — shipped, wider than admin

- **File:** [`packages/crm/src/components/theme/public-theme-provider.tsx`](packages/crm/src/components/theme/public-theme-provider.tsx) — 24 LOC wrapper
- **Core:** `themeToCSS(theme)` emits **9+ CSS custom properties**: `--sf-primary`, `--sf-accent`, `--sf-font`, `--sf-radius`, `--sf-bg`, `--sf-text`, `--sf-card-bg`, `--sf-muted`, `--sf-border`
- **Custom font:** loads workspace's Google Font via `<link>` tag
- **Mode:** respects `theme.mode` (light/dark) — unlike admin, customer surfaces DO flip on workspace-configured dark mode
- **Scope:** applied at customer route layouts (public booking, intake, portal)

**Asymmetry vs admin (by design):**
- Admin → narrow 4-var override (`--primary`, `--ring`, `--accent`, `--radius`); preserves shadcn chrome consistency across workspaces
- Customer → full branded takeover (9+ vars + font + mode)

This asymmetry means SLICE 4b patterns must consume `--sf-*` namespace vars, NOT shadcn tokens directly. Any pattern that references `bg-primary` needs a sibling utility class that resolves to `--sf-primary` on customer surfaces.

### §2.5 Scaffold bridge — extension needed

- **Current state:** BlockSpec has NO `customer_surfaces` concept. 4a shipped `entities` → admin file emission only.
- **Existing customer surfaces** (bookings, intake) are **hardcoded migrations**, not scaffold-driven.
- **Extension shape:** additive `customer_surfaces` field on BlockSpec. Cleanest shape proposed in §6.3 below.
- **Constraint:** BlockSpec is intentionally JSON-friendly + minimal. 4b extension stays additive; defaulted; zero breaking changes.

---

## §3 Scope definition

### In-scope

1. **Three customer-facing composition patterns** — all client components since customer UIs generally need interactivity:
   - `<PortalLayout>` — route wrapper for customer portal surfaces (theme boundary, nav chrome, session indicator, footer)
   - `<CustomerDataView>` — tabular/card data display for read-only customer contexts (booking history, intake submissions, etc.)
   - `<CustomerActionForm>` — multi-step/single-step form with Zod-driven field inference + public-theme styling + animated transitions
2. **Proof migration** — migrate `BookingWidget` (per G-4b-2 recommendation) to use SLICE 4b patterns. Exercises `<CustomerActionForm>` for the details step, `<CustomerDataView>` for the slots display, and validates the overall pattern surface.
3. **Themed `<CustomerLogin>` component** — per G-4b-1 recommendation. Replaces the unthemed OTC form on `/portal/[orgSlug]/login`. Uses SLICE 4a patterns + `PublicThemeProvider` for workspace branding.
4. **Scaffold → Customer UI bridge** — BlockSpec `customer_surfaces` extension + renderers + writer + orchestrator wiring + smoke test. Parallel to the 4a admin bridge.
5. **Shallow-plus integration harness** (per G-4b-4 recommendation) — integration harness for the 3 patterns + public theme flow + magic-link smoke test + form submission path smoke.
6. **L-17 multiplier refinement artifacts** — at close, confirm 0.94x composition + 1.7x-2.0x state-machine multipliers across the 4b data set.

### Out of scope

1. **IntakeForm migration** (per G-4b-2 recommendation) — migrating just BookingWidget is the state-machine stress test; IntakeForm's ~2.0x multiplier + progressive-disclosure depth makes dual migration push us materially past the 3,500 LOC target. IntakeForm migration lands in a post-launch polish slice OR as a standalone follow-up PR.
2. **User-interaction testing (click simulation, form submission flows)** — deferred per G-4b-4. The shallow-plus harness catches compositional conflicts + smoke-level form path success; deep interaction testing is a separate slice with jsdom + testing-library.
3. **Accessibility audits (axe-core)** — deferred; customer-surface a11y is a launch-readiness concern but needs a dedicated slice with the DEEP harness posture.
4. **Public-surface dark/light mode verification** — manual @ preview per G-4-6.
5. **Stripe checkout UX** — the existing BookingWidget's Stripe redirect flow stays untouched; migration preserves behavior.
6. **Portal session refresh / logout UX** — the existing portal auth plumbing ships as-is; SLICE 4b only replaces the login form chrome.
7. **Customer email templates** — out of scope.

---

## §4 Quality bar

Customer-facing UI carries higher brand-damage risk than admin. Quality bar is elevated vs 4a:

| Gate | 4a standard | 4b standard |
|---|---|---|
| Typography | Consistent token scale | Must honor workspace fontFamily via `--sf-font`; line-heights verified at multiple sizes |
| Spacing | Token scale | Token scale + mobile-breakpoint-aware by default |
| Empty states | Intentional copy | Intentional copy **+** intentional CTA (customer needs next action) |
| Loading states | N/A (SSR) | Required — customer flows have async boundaries (slot loading, form submit) |
| Error states | Distinguishable | Distinguishable **+** recoverable (retry path visible, never dead-end) |
| Focus | Hover fallback acceptable | **Focus-visible ring required** (customers navigate via keyboard more often than builders) |
| Motion | `duration-fast` token | `prefers-reduced-motion` honored **+** no animation outside intentional transitions |
| Mobile | 375px should work | 375px **primary**; tablet + desktop tested |
| Theme | Admin's 4-var narrow override | Full `PublicThemeProvider` 9-var takeover |

### Reference points (public customer surfaces done well)

- **Stripe Checkout** — the gold standard for single-purpose customer form flow: clear step headers, motion only on state transitions, error recovery inline, never dead-ends, theme-aware without requiring customer config.
- **Calendly booking** — the canonical state-machine for slot selection → details → confirmation. Our existing BookingWidget is structurally similar; 4b's migration should preserve this shape while landing on `<CustomerActionForm>` + `<CustomerDataView>`.
- **Linear customer portal** — minimal, theme-consistent, empty states with CTAs. Our portal post-SLICE-4b should feel at home alongside Linear's — not necessarily match their aesthetic, but match the care.

Quality bar is referenced in each pattern's acceptance test, not aspirational. Gates 1-8 automate; gates 9-11 have manual-at-preview steps documented in close-out.

---

## §5 Component inventory + state-machine classification

Four new components + one migration + one login replacement.

### §5.1 `<PortalLayout>`

**Purpose:** top-level route wrapper for customer portal surfaces. Wraps children in `PublicThemeProvider`, renders optional nav chrome (org logo + session indicator + "Sign out" link), renders optional footer.

**State:** none beyond prop-driven rendering. Session state comes from the route's server component via props (not client-owned).

**L-17 classification:** **pure composition, 0.94x.**

**Shape (proposed):**
```tsx
<PortalLayout
  theme={orgTheme}                        // required — drives PublicThemeProvider
  orgName="Acme Dental"                   // required — header
  logoUrl={theme.logoUrl}                 // optional — header logo
  sessionEmail={session?.email}           // optional — "signed in as …" + logout
  signOutHref="/portal/acme/logout"       // optional
  footer={<FooterCopy />}                 // optional
>
  {children}
</PortalLayout>
```

### §5.2 `<CustomerDataView>`

**Purpose:** data display for read-only customer contexts (booking history, past intake submissions, "your appointments" lists). Analog of `<EntityTable>` but themed for customer surfaces + card-based by default (tables feel utilitarian; cards feel branded).

**State:** none — pure rendering.

**L-17 classification:** **pure composition, 0.94x.** Mirrors `<EntityTable>` + `<CompositionCard>` from 4a; no state machine.

**Shape (proposed):**
```tsx
<CustomerDataView
  schema={BookingSchema}                  // Zod-driven field labels + inference
  rows={upcomingBookings}
  layout="cards" | "table"                // default "cards"
  fields={["when", "with", "status"]}     // optional ordered subset
  emptyState={<span>No bookings yet. <Link>Book one →</Link></span>}
  ariaLabel="Upcoming bookings"
/>
```

### §5.3 `<CustomerActionForm>`

**Purpose:** themed form primitive for customer actions (submit booking details, intake question answers, portal profile edits). Bridges Zod schema → themed fields → submit action. Handles single-step AND multi-step (progressive disclosure, like IntakeForm's shape).

**State:** **owns a state machine** when in multi-step mode. Tracks current step, accumulated answers, validation-error state, submission-pending state.

**L-17 classification:** **state-machine, 1.8x-2.0x.** Two modes (single vs multi); multi-step mode is the stressor. Three-datapoint test matrix: single-step happy path, multi-step progression, error/recovery.

**Shape (proposed):**
```tsx
<CustomerActionForm
  mode="single" | "multi"                 // default "single"
  schema={BookingDetailsSchema}
  steps={[                                 // required when mode="multi"
    { fields: ["firstName", "lastName"], title: "About you" },
    { fields: ["notes"],                  title: "Anything else?" },
  ]}
  defaultValues={…}                       // optional
  action={submitBooking}                   // server action
  submitLabel="Confirm booking"
  onSuccess={…}                            // optional client-side handler
  theme={orgTheme}                         // required — for --sf-* styling
/>
```

### §5.4 `<CustomerLogin>`

**Purpose:** themed replacement for the unthemed OTC form currently at `/portal/[orgSlug]/login`. Renders a 2-step flow (email → code) using `<CustomerActionForm>` internally. Ships the branding the current login lacks.

**State:** **state-machine, 1.7x.** Two-step flow (request code → verify code) with server-action transitions + error display for bad codes.

**L-17 classification:** **state-machine, 1.7x.** Narrower than `<CustomerActionForm>` multi-step (fixed 2 steps, fixed field shape).

**Shape (proposed):** thin wrapper that composes `<CustomerActionForm>` mode=multi with two fixed steps, wired to the existing portal auth server actions.

### §5.5 `<CustomerDataViewSkeleton>` + `<CustomerActionFormSkeleton>`

**Purpose:** per Quality-bar §4 upgrade, customer surfaces MUST ship loading skeletons. Minimal primitives — Tailwind `bg-muted animate-pulse` placeholders matching the rendered shape.

**State:** none.

**L-17 classification:** **pure composition, 0.94x.**

### §5.6 Proof migration: BookingWidget → 4b patterns

- Rewrite `public-booking-form.tsx` to use `<CustomerDataView>` for slot display + `<CustomerActionForm>` (multi-step) for date/slot/details flow
- Preserve existing behavior (Stripe checkout redirect, slot fetch, submit action)
- Expected: ~150-200 LOC net REDUCTION in the file (composition primitives absorb boilerplate)
- **L-17 classification:** **0x test LOC (integration-covered by pattern tests, per 4a activities-migration precedent)**

---

## §6 LOC projection with calibrated L-17 multipliers

Applying the refined L-17 addendum from SLICE 4a close.

### §6.1 Component LOC estimates

| Component | Prod LOC | Category | Multiplier | Test LOC |
|---|---|---|---|---|
| `<PortalLayout>` | ~85 | composition | 0.94x | ~80 |
| `<CustomerDataView>` | ~180 | composition | 0.94x | ~170 |
| `<CustomerActionForm>` single-mode | ~160 | composition | 0.94x | ~150 |
| `<CustomerActionForm>` multi-mode | ~120 | state-machine | 1.8x | ~215 |
| `<CustomerLogin>` | ~60 | state-machine (fixed 2-step) | 1.7x | ~100 |
| `<CustomerDataViewSkeleton>` + `<CustomerActionFormSkeleton>` | ~40 | composition | 0.94x | ~35 |
| BookingWidget proof migration | ~200 (net: likely -50 LOC from current 285 → ~235) | — | 0x | 0 |
| **Subtotal — components** | **~845** | | | **~750** |

### §6.2 Scaffold → Customer UI bridge

| File | Prod LOC | Test LOC | Multiplier |
|---|---|---|---|
| BlockSpec extension (`customer_surfaces` field) | ~35 | ~40 | 1.1x |
| `renderCustomerSurfaceTsx` renderer | ~70 | ~80 | 1.1x |
| Orchestrator wiring (file plan extension) | ~15 | ~20 | 1.3x |
| Smoke test (dynamic-import + renderToString) | 0 | ~120 | artifact |
| Backward-compat fixture updates (estimated 4-5 files × ~5 LOC = ~25) | ~25 | — | — |
| **Subtotal — bridge** | **~145** | **~260** | |

### §6.3 Integration harness (shallow-plus per G-4b-4)

| Coverage | Test LOC |
|---|---|
| 3 patterns render without errors | ~60 |
| `PublicThemeProvider` propagates full 9-var set | ~40 |
| Magic-link smoke (request → verify flow with mocked email sink) | ~80 |
| Form submission path smoke (CustomerActionForm single + multi) | ~80 |
| Zero console.error across pattern suite | ~30 |
| **Subtotal — harness** | **~290 (artifact)** |

### §6.4 Artifacts

| Artifact | LOC |
|---|---|
| §4 QA checklist walk-through (customer-surface-specific gates) | ~400 |
| SLICE 4b close-out report | ~400 |
| 9-probe regression artifacts | ~150 |
| L-17 confirmation addendum (if needed) | ~40 |
| **Subtotal — artifacts** | **~990** |

### §6.5 SLICE 4b total projection

| Bucket | Prod | Tests | Artifacts |
|---|---|---|---|
| Components | 845 | 750 | — |
| Scaffold bridge | 145 | 260 | — |
| Harness | — | 290 | — |
| Artifacts | — | — | 990 |
| **Total** | **990** | **1,300** | **990** |
| **Grand total** | | | **~3,280 LOC** |

**Landing analysis:**
- Max's expectation: ~3,500 LOC
- Audit projection: ~3,280 LOC — **6% under the expected target**
- Stop-and-reassess trigger: 4,500 LOC (30% over 3,500) — **27% headroom**
- **Audit-time L-17 flag: NOT REQUIRED** (projection is safely under the 4,500 threshold)

### §6.6 Confidence level

Moderate-high:
- Two-PR two-datapoint confirmation of the 0.94x composition multiplier from SLICE 4a
- BookingWidget's actual 285 LOC in hand (real measurement, not estimate) → migration target is bounded
- IntakeForm's 400 LOC confirms the 1.7x-2.0x state-machine band for progressive-disclosure depth
- Scaffold bridge sized against 4a's actual numbers (135 prod + 220 tests = 1.63x); 4b extension should land similarly

Risk factors:
- `<CustomerActionForm>` multi-mode could overshoot 1.8x if test coverage needs per-step-per-field-type combinatorics — capped upward at ~2.0x = ~240 test LOC (+25 over projection). Absorbable.
- Scaffold bridge's `theme_scope` field (see §6.3 below) may add complexity if it needs to emit conditionally themed routes. +~50 LOC cap.

Total upward risk: ~75 LOC. Even at worst case, projection lands ~3,355 LOC, still 25% under trigger.

---

## §7 Proposed PR split

Two PRs, mirroring SLICE 4a's pattern-then-bridge-then-close structure but collapsing PR 2 + PR 3 into a single bridge + harness + close PR since 4b has less scope per PR.

### §7.1 PR 1 — Three customer patterns + proof migration + auth UI (~1,800 LOC)

**Mini-commit structure (proposed):**

- **C1:** `<PortalLayout>` + L-20 ground-truth pin in commit body + tests (~165 LOC)
- **C2:** `<CustomerDataView>` + tests (~350 LOC)
- **C3:** `<CustomerActionForm>` single + multi mode + tests (~645 LOC — largest commit, state-machine stress)
- **C4:** `<CustomerLogin>` + `<*Skeleton>` primitives + tests (~235 LOC)
- **C5:** BookingWidget proof migration (~200 LOC; `-50 net` from current file)
- **C6:** 9-probe regression + PR 1 close-out (~200 LOC artifact)

**Green bar:** 830+ base tests + ~750 new = 1,580+; tsc clean; emit clean; preview URL manual walk through bookings.

### §7.2 PR 2 — Scaffold bridge + shallow-plus harness + SLICE 4b close (~1,480 LOC)

**Mini-commit structure (proposed):**

- **C1:** BlockSpec `customer_surfaces` extension + backward-compat fixture updates (~60 LOC)
- **C2:** `renderCustomerSurfaceTsx` + orchestrator wiring + tests (~185 LOC)
- **C3:** Scaffold bridge smoke test (dynamic import + render) (~120 LOC, artifact)
- **C4:** Integration harness — 3 patterns + theme propagation + magic-link + form paths + console hygiene (~290 LOC, artifact)
- **C5:** §4 QA checklist + L-17 confirmation addendum (~440 LOC, artifact)
- **C6:** 9-probe regression + SLICE 4b close-out report (~550 LOC, artifact)

**Green bar:** 1,580+ tests + ~150 harness tests = ~1,730+; 9-probe regression 9/9 PASS preserving hash streak; preview URL manual QA walk.

### §7.3 Rationale for 2-PR split vs 3-PR

4a shipped in 3 PRs because PR 1 (foundation + primitives + proof) had a natural split from PR 2 (deeper patterns + scaffold bridge) which split from PR 3 (harness + QA + close). 4b's scope is smaller (3 patterns vs 7 + bridge extension vs new scaffolding + fewer artifacts since L-17 is already refined), so collapsing PR 2 + PR 3's equivalents is natural. If PR 1 runs long (>2,200 LOC), split reconsideration triggers mid-implementation per L-17 mid-PR stop-trigger.

---

## §8 Gates

Four gates to resolve before implementation starts.

### §8.1 G-4b-1 — Customer auth UX

**Question:** Does SLICE 4b ship a themed `<CustomerLogin>` or leave the existing unthemed OTC form as-is?

**Options:**
- **A:** Leave existing magic-link OTC form. Defer themed login to a future slice.
- **B:** Ship `<CustomerLogin>` using 4a composition patterns + `PublicThemeProvider`.

**Recommendation:** **B.** Three reasons:

1. **Tractability:** The auth plumbing (`requestPortalAccessCodeAction`, `verifyPortalAccessCodeAction`, JWT session issue) is already shipped in `lib/portal/auth.ts`. 4b is replacing form chrome, not designing flow. ~60 prod + ~100 tests = 160 LOC — the smallest 4b line item.

2. **Quality gate alignment:** the `<CustomerLogin>` surface is a trust-critical customer touchpoint. Shipping it unthemed in v1 means "sign in with Acme Dental" renders in generic gray while the rest of the customer experience is Acme-branded. A visible inconsistency at the trust boundary undermines the brand-flow narrative.

3. **Demo surface:** launch demos WILL show the portal login. An unthemed login breaks the demo's "look how branded this feels" story.

**Constraint:** keep scope tight — `<CustomerLogin>` uses existing auth server actions as-is; we're NOT re-architecting session flow, token TTL, or email delivery.

### §8.2 G-4b-2 — Existing customer surface migration scope

**Question:** Which existing customer surfaces migrate to 4b patterns?

**Options:**
- **A:** BookingWidget + IntakeForm (both).
- **B:** BookingWidget only (proof).
- **C:** Neither (ship patterns alone; migrate in follow-up slice).

**Recommendation:** **B.** Three reasons:

1. **State-machine stress test:** BookingWidget's 2-step + async-slot-load + confirmation-branch shape exercises every `<CustomerActionForm>` multi-mode path at once. One migration proves the pattern.

2. **IntakeForm is disproportionate:** 400 LOC + progressive-disclosure state machine + per-field-type widgets + animated transitions. Migrating it means the pattern absorbs framer-motion + keyboard-shortcut matrix + N-question progression. That's a 1.8x-2.0x multiplier ALONE on the migration — pushes 4b LOC to ~4,000+. Marginal value: IntakeForm is already well-shaped; composition primitives gain little.

3. **Followup clarity:** IntakeForm migration becomes a well-scoped post-launch ticket (~400 LOC + ~100 tests) if patterns mature further. Not shipping it now doesn't block launch; shipping it now pushes 4b through the trigger.

**Alternative if Max wants both:** expand LOC trigger to 4,800 AND accept that BookingWidget becomes the state-machine calibration point for `<CustomerActionForm>` while IntakeForm becomes a non-calibration "does it absorb complexity" stress test. I recommend against this — better to ship 4b tight and evaluate IntakeForm migration against post-launch usage data.

### §8.3 G-4b-3 — Scaffold → Customer UI bridge policy

**Question:** When a block declares `customer_surfaces`, how does the scaffold decide to emit files for them?

**Options:**
- **A:** Auto-generate whenever `customer_surfaces` is declared. Opt-out requires removing from spec.
- **B:** Require explicit opt-in per surface (extra field like `scaffold: true`).
- **C:** Hybrid — auto for display surfaces, explicit opt-in for forms (CustomerActionForm specifically).

**Recommendation:** **C (hybrid).** Three reasons:

1. **Trust asymmetry:** customer-facing forms collect user data. Emitting a form route without explicit opt-in means a builder's NL request "add a bookings block" might auto-generate a public-facing form without the builder realizing it's collecting customer data at a discoverable URL. That's a consent-semantics issue.

2. **Display surfaces are safe-by-default:** read-only `<CustomerDataView>` surfaces only render data the builder already declared as public via the block's tool surface. No new collection; no new trust boundary.

3. **Builder ergonomics:** requiring opt-in for forms means the builder explicitly acknowledges "yes, I want this public-facing form." Matches the opt-in patterns already in place for other trust-sensitive surfaces (payment keys, custom domains).

**Concrete shape:**

```typescript
const CustomerSurfaceSchema = z.object({
  slug: z.string().regex(BLOCK_SLUG_PATTERN),       // e.g. "public-intake"
  label: z.string().min(1),                         // e.g. "Public Intake Form"
  mode: z.enum(["display", "form", "portal"]),      // which pattern to use
  entity: z.string().optional(),                    // reference to a declared entity
  theme_scope: z.enum(["public"]).default("public"),// public only for v1
  // For mode="form", the builder must also add:
  scaffold: z.boolean().default(false),             // explicit opt-in for forms
});

// Orchestrator emits only if:
//   mode === "display"            OR
//   mode === "portal"             OR  
//   (mode === "form" && scaffold === true)
// Otherwise the customer_surface entry is metadata-only (reserved for manual impl).
```

### §8.4 G-4b-4 — Integration harness depth

**Question:** How deep does the 4b integration harness go?

**Options:**
- **A:** Shallow (same as 4a) — renderToString + regex + console capture.
- **B:** Shallow-plus — A + magic-link flow smoke + theme application on public routes + form submission path smoke.
- **C:** Deep — A + B + user interaction testing (jsdom + testing-library + user-event) + axe-core a11y.

**Recommendation:** **B (shallow-plus).** Three reasons:

1. **Trust stakes warrant more verification than 4a's shallow.** Customer surfaces are the brand face. We need smoke coverage for auth flow + form paths + theme — not just "each pattern renders."

2. **Deep harness (C) is a separate slice.** jsdom + testing-library + user-event adds ~800 LOC of test infrastructure + shifts the G-4-6 posture. Worth doing, but bundle it with a11y audit + visual regression in a "customer-surface hardening" post-launch slice.

3. **Shallow-plus fits in 4b's LOC envelope:** ~290 harness LOC (see §6.3) vs deep harness's ~1,100+. The former absorbs; the latter breaks the trigger.

**Concrete "shallow-plus" scope:**
- All 4a shallow-harness patterns (renderToString + console hygiene)
- Magic-link smoke: invoke `requestPortalAccessCodeAction` with a mocked email sink, invoke `verifyPortalAccessCodeAction` with the captured code, assert JWT minted. Verifies the auth plumbing the themed login sits on top of.
- Form submission smoke: instantiate `<CustomerActionForm>` with a fake action, verify submit trip produces formData with expected fields. NOT a click simulation — a direct invocation of the form's handler.
- Theme propagation: assert `PublicThemeProvider`'s 9-var override set lands on the DOM.

---

## §9 SLICE 4b → launch-readiness assessment

What remains after SLICE 4b closes, mapped against v1 launch:

### §9.1 Complete at 4b close

- Admin composition patterns (SLICE 4a) ✓
- Customer composition patterns (SLICE 4b) — this slice
- Admin theme bridge (SLICE 4a) ✓
- Customer theme bridge (pre-SLICE-4) ✓; 4b patterns consume it
- Scaffold → admin bridge (SLICE 4a) ✓
- Scaffold → customer bridge (SLICE 4b) — this slice
- Customer auth (pre-SLICE-4) ✓ + themed login (SLICE 4b)
- CRM proof surface (activities, 4a)
- BookingWidget proof surface (4b)

### §9.2 Remaining for v1 launch

1. **SLICE 5 — scheduled triggers.** Workflow engine can already run on event triggers; scheduled ("every Monday 9am", "1 hour after booking") needs the cron-backed dispatcher.
2. **SLICE 6 — external-state branching.** Workflow steps that branch on HTTP GETs (stock checks, availability polls).
3. **SLICE 7 — message triggers.** Incoming SMS/email as workflow triggers (beyond the current Twilio webhook basics).
4. **SLICE 8 — workspace test mode.** Sandbox mode where workflow runs don't hit real Twilio/Stripe/email.
5. **SLICE 9 — worked example + composability validation.** End-to-end demo scenario exercising every primitive together. Primary go/no-go signal for launch.

### §9.3 Post-launch (not blocking)

- Deep UI harness (jsdom + testing-library + axe-core)
- IntakeForm migration to 4b patterns
- Customer-surface accessibility audit
- Public-surface dark/light mode verification
- Mobile breakpoint polish (EntityTable overflow follow-up ticket from 4a)
- Focus-visible ring sweep (follow-up ticket from 4a)

### §9.4 Launch readiness after 4b

**UI layer:** feature-complete. Both admin + customer composition primitives exist; scaffold emits to both; theme bridges both; proof migrations validate both on real data.

**Workflow layer:** incomplete. SLICE 5/6/7/8 deliver the runtime capabilities that make scaffolded workflows actually useful in production.

**Strategic implication:** 4b closes the UI arc. The remaining 5 slices are workflow + sandbox + worked-example. Launch = all 9 slices shipped + demo walk-through against SLICE 9's scenario.

---

## §10 Risk register + mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `<CustomerActionForm>` multi-mode exceeds 2.0x multiplier | Medium | Medium | Mid-PR check after C3; if test LOC overshoots projection by >15%, stop + reassess per L-21 |
| BookingWidget migration introduces regression in Stripe checkout redirect | Low | High | Preserve existing redirect code path byte-identical; smoke test the redirect URL generation |
| Scaffold bridge `customer_surfaces` extension breaks 4a admin scaffold | Low | Medium | Additive + defaulted; regression caught by existing 4a scaffold tests (16 tests) |
| Probe hash drift surfaces at PR 2 regression | Very low | Very high | No changes to lib/agents/types.ts, SeldonEvent union, subscription primitive, or scaffold core runtime; predicted hash-stable per 4a precedent |
| 4b patterns reference shadcn tokens (admin-styled) instead of `--sf-*` (customer-styled) | Medium | Medium | Explicit pattern-authoring checklist: every customer pattern grep'd for shadcn-token references at C1 close |
| Themed `<CustomerLogin>` regresses existing auth plumbing | Low | High | `<CustomerLogin>` wraps existing server actions untouched; auth verification via magic-link smoke test in harness |

No risk at "high likelihood + high impact." All medium-risk items have concrete mitigations.

---

## §11 Calibration checkpoint (applies L-17 refined addendum)

Per SLICE 4a PR 3 C3's L-17 refinement, the audit explicitly categorizes:

| Bucket | Expected multiplier | SLICE 4b count |
|---|---|---|
| Pure composition (0.94x) | 0.94x | 4 components + skeletons + bridge renderer |
| State-machine (1.7x-2.0x) | 1.7x-2.0x | 2 components (`<CustomerActionForm>` multi, `<CustomerLogin>`) |
| Scaffold/schema/renderer | L-17 original spectrum | 1 bridge extension |
| Artifacts | not multiplier-inflated | 3 (harness + QA + close-out) |

Total under calibrated projection: ~3,280 LOC (§6.5). Stop trigger: 4,500 LOC.

**Verdict:** within calibration band. Stop-trigger conversation NOT required at audit time. L-17 rule validation opportunity at PR 2 close: does the observed SLICE 4b multiplier match the refined addendum? If yes, the rule is settled across three PRs × three multiplier classes. If no, further refinement data.

---

## §12 Recommended decisions

Summarizing §8 recommendations:

| Gate | Recommendation | Rationale |
|---|---|---|
| G-4b-1 auth UX | **B** (themed CustomerLogin) | Plumbing shipped, quality-bar alignment, demo surface |
| G-4b-2 migration scope | **B** (BookingWidget only) | State-machine stress test, 4b fits trigger |
| G-4b-3 bridge policy | **C** (hybrid, form opt-in) | Trust asymmetry, display safe-by-default, builder consent |
| G-4b-4 harness depth | **B** (shallow-plus) | Trust stakes warrant more than 4a-shallow; deep harness is its own slice |

---

## §13 Stopping point

Audit drafted. Stopping per instructions; no code until Max resolves the four gates.

**Expected revision rounds:** 1-2. Likely discussion points:
- G-4b-3 hybrid bridge policy — reasonable concern about the consent-semantics framing
- LOC projection confidence — could request more granular breakdown of `<CustomerActionForm>` test surface
- `<CustomerLogin>` scope boundary — "does it also handle session-expiry redirect UX?" If yes, +LOC; if no (current recommendation), +1 follow-up ticket.

Awaiting gate resolution. No implementation until approved.
