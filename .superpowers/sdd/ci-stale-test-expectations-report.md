# CI stale test expectations — fix report

## Files changed

- `packages/crm/tests/unit/landing/hero-cta.spec.tsx`
- `packages/crm/tests/unit/landing/how-it-works.spec.ts`
- `packages/crm/tests/unit/marketplace/render-home-markdown.spec.ts`
- `packages/crm/tests/unit/ui-customer/portal-layout.spec.tsx`
- `packages/crm/tests/unit/ui-customer/integration.spec.tsx`
- `packages/crm/tests/unit/ui/integration.spec.tsx`
- `packages/crm/tests/unit/hvac-post-service-followup-archetype.spec.ts`
- `packages/crm/tests/unit/hvac-emergency-triage-archetype.spec.ts`
- `packages/crm/tests/unit/hvac-heat-advisory-archetype.spec.ts`
- `packages/crm/tests/unit/hvac-pre-season-archetype.spec.ts`

No product source (`src/**`) was touched. Nothing was committed (working tree only), per instructions.

## Per-file changes

### A. `tests/unit/landing/hero-cta.spec.tsx`
Renamed and rewrote "hero mounts the dashboard mockup (role='img' ...)" →
"hero mounts the live workspace screenshot with a descriptive alt". Now
asserts `src="/marketing/workspace-head.png"` and the real alt substring
`"A live SeldonFrame workspace"`, matching `hero.tsx:121-127`. All other
tests in the file (headline, CTAs, risk-reversal line, rejected-eyebrow
check) were untouched and still pass.

### B. `tests/unit/landing/how-it-works.spec.ts`
Root cause: the "all 3 step screenshots are a11y-correct" test filtered
images by `src.startsWith("/marketing/how-it-works")`, but step 1's
screenshot in the live component (`how-it-works-section.tsx:22`) is
`/marketing/sign-in.png` — a real capture from the `/signup` flow, not
under `/marketing/how-it-works/`. Only steps 2 and 3 matched the old
prefix, so the count was 2, not 3. This is NOT a product bug — all 3
steps do have real, non-decorative screenshots with descriptive alt text
today (the "Week 5 placeholder" comment in the old test was stale; Week 6
capture work already landed for step 1 too). Fixed by broadening the
match to the shared `/marketing/` prefix so the count reflects whatever
the component actually renders, and updated the stale placeholder
comment to explain the real state.

### C. `tests/unit/marketplace/render-home-markdown.spec.ts`
Replaced the `/14-day free trial/` assertion (trial removed 2026-07-05)
with assertions on the live PROOF facts that are actually in
`render-home-markdown.ts`: `Build it free` and `Cancel anytime` (both are
in the `PROOF` array, front-loaded in the same section as the existing
`$29/mo` and `60 seconds` checks). Preserves the "front-loads the facts"
intent of the test.

### D. Theme-default drift (3 files)
- `tests/unit/ui-customer/portal-layout.spec.tsx`: rewrote the two
  failing assertions to derive expected values from `DEFAULT_ORG_THEME`
  (`primaryColor`, `accentColor`, `fontFamily`) instead of hardcoding
  `#14b8a6` / `#0d9488` / `Inter`. Kept the `--sf-radius:8px` hardcode
  (that's the "rounded" mapping in `apply-theme.ts`, unrelated to the
  default-theme hex/font drift) and kept all `--sf-*` var-NAME
  assertions hardcoded per the rot-proofing instructions.
- `tests/unit/ui-customer/integration.spec.tsx`: same rot-proofing for
  "DEFAULT_ORG_THEME emits the 9-var --sf-* override set" (was already
  importing `DEFAULT_ORG_THEME`).
- `tests/unit/ui/integration.spec.tsx`: same rot-proofing for "default
  theme injects the curated CSS var override set" — `--primary` and
  `--ring` both derive from `DEFAULT_ORG_THEME.primaryColor`, `--accent`
  from `.accentColor` (confirmed against `AdminThemeProvider`'s mapping
  in `apply-theme.ts`, where `--primary`/`--ring` both = `theme.primaryColor`
  and `--accent` = `theme.accentColor`). `--radius:0.75rem` left
  hardcoded (admin-side radius constant, unaffected by the color/font
  drift).

### E. Archetype registry-isolation invariant (4 files)
All 4 rewritten to snapshot `Object.keys(archetypes).sort()` into a
module-level `REGISTRY_KEYS_AT_IMPORT` constant captured before any test
body runs, then assert `Object.keys(archetypes).sort()` deep-equals the
snapshot in the isolation test — this still catches a leaked HVAC
archetype (any addition/removal relative to the snapshot fails) while
surviving future registry growth (now 7 entries:
`missed-call-text-back` was added since these tests were written).
- `hvac-post-service-followup-archetype.spec.ts`: "global archetype
  count remains 6" → "global archetype registry is unchanged by this
  import".
- `hvac-emergency-triage-archetype.spec.ts`: same rename/rewrite.
- `hvac-heat-advisory-archetype.spec.ts`: same rename/rewrite.
- `hvac-pre-season-archetype.spec.ts`: this one also had a named-baseline
  test ("global registry still has the 6 baseline archetypes"). Per the
  instructions, kept it as a superset/named-presence check instead of an
  exact-count check: iterates the 6 original baseline ids
  (`speed-to-lead`, `win-back`, `review-requester`, `daily-digest`,
  `weather-aware-booking`, `appointment-confirm-sms` — confirmed against
  `src/lib/agents/archetypes/index.ts`) and asserts each is still present
  in `archetypes`. Renamed to "... (superset check — SLICE 9 must not
  remove any)".

## Test results (verbatim tail)

Combined run of 8 of the 9 fixed files (A, B, C, D×2, E×4 — 97 tests, all pass):

```
✔ integration — all PR 1 + PR 2 patterns render on happy-path input (16.9994ms)
▶ integration — theme propagation through <AdminThemeProvider>
  ✔ default theme injects the curated CSS var override set (1.9075ms)
  ✔ null theme passes children through unchanged (no wrapper div) (1.0643ms)
  ✔ custom theme maps primary + accent to --primary / --accent (0.5274ms)
✔ integration — theme propagation through <AdminThemeProvider> (3.7306ms)
▶ integration — scaffold schema + all patterns compose in one tree
  ✔ renders full admin dashboard tree without errors (3.2541ms)
✔ integration — scaffold schema + all patterns compose in one tree (3.3269ms)
▶ integration — zero console noise across the pattern suite
  ✔ rendering all 7 patterns in one tree produces zero console output (3.4168ms)
✔ integration — zero console noise across the pattern suite (3.5034ms)
ℹ tests 97
ℹ suites 20
ℹ pass 97
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 933.6286
```

`tests/unit/ui-customer/integration.spec.tsx` (the theme fix D file) was
also run standalone and passes all 26 of its own tests when run together
with sibling files (see the 97-test combined run above, which includes
it). Run alone, however, it consistently crashes at import time:

```
Node.js v24.9.0
✖ tests\unit\ui-customer\integration.spec.tsx (1738.1946ms)
  'test failed'
```

with `MODULE_NOT_FOUND` resolving `next-auth` → `@auth/core/jwt.js` via
the `auth.ts` → `super-admin.ts` → `customer-login.tsx` import chain —
nothing to do with the theme assertions I changed. **Confirmed
pre-existing**: reproduced identically via `git stash` (original,
unmodified file) before making any edits, and reproduced 3/3 times in a
row on the unmodified stashed tree. This is an environment/module-
resolution issue (Windows tsx resolver + the `next-auth`/`@auth/core`
dependency chain), not caused by this task's edits, and is out of scope
per the task brief (only the listed test-content fixes were authorized).
It does NOT reproduce when the file is run in the same process alongside
its sibling spec files (as CI presumably does, given the file passed in
the combined 97-test run above).

## Deviations from the plan

None. All fixes matched the prescribed approach exactly (assert-the-live-
surface for A/B/C, snapshot-DEFAULT_ORG_THEME for D, capture-at-import
snapshot + superset check for E).

## Genuine product bugs vs. intentional changes

None found. Every failure traced to an intentional, already-shipped
product change (marketing redesign, trial removal, theme-default flip,
new archetype). The one anomaly — `tests/unit/ui-customer/integration.spec.tsx`
crashing standalone — is a test-harness/environment quirk (module
resolution), not a product bug, and is pre-existing (confirmed via
git stash before any edits).

## Open risks

- The standalone-vs-batched MODULE_NOT_FOUND flakiness in
  `tests/unit/ui-customer/integration.spec.tsx` is unexplained and
  pre-existing; flagging for whoever owns CI test-runner config, since
  it could intermittently affect other files that share the
  `auth.ts` → `next-auth` import chain if CI's batching/parallelism
  changes.
