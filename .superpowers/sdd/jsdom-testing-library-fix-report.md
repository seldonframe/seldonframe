# jsdom bootstrap for @testing-library/react specs — report

## Files changed

- `packages/crm/tests/unit/helpers/dom.ts` (new) — jsdom bootstrap helper
- `packages/crm/tests/unit/web-onboarding/upgrade-modal.spec.tsx` (modified — import only)
- `packages/crm/tests/unit/web-onboarding/clients-new-form.spec.tsx` (modified — import, `FakeEventSource.removeEventListener`, one test's assertions rewritten)
- `packages/crm/tests/unit/web-onboarding/create-client-cta.spec.tsx` (modified — import, two tests' role queries rewritten)

## What changed per file

### `tests/unit/helpers/dom.ts` (new)
Side-effect module: constructs `new JSDOM(..., { url: "http://localhost/", pretendToBeVisual: true })` and copies `window`, `document`, `navigator`, `HTMLElement`/`Element`/`Node`, `MouseEvent`/`KeyboardEvent`/`Event`/`CustomEvent`, `getComputedStyle`, `requestAnimationFrame`/`cancelAnimationFrame`, `PointerEvent`, `DOMRect`, `MutationObserver` onto `globalThis` via `Object.defineProperty(..., { configurable: true })` (Node 24 makes some globals non-configurable getters otherwise). Also aliases `self` and polyfills `requestIdleCallback`/`cancelIdleCallback` (needed by `next/link`'s prefetch warmup), stubs `window.matchMedia` (jsdom has no layout engine to evaluate media queries — needed by the `/clients/new` build-animation's `idle-scene.tsx`, which calls `matchMedia` unconditionally in an effect), and sets `globalThis.IS_REACT_ACT_ENVIRONMENT = true` for React 19 act() support. Mirrors the existing `packages/crm/tests/setup-dom.ts` (wired in via `--import` for a different harness entry point) but is directly importable so a spec is self-sufficient under plain `node --import tsx --test <file>`.

### `upgrade-modal.spec.tsx`
Added `import "../helpers/dom";` as the first import. No other changes — a prior scout's assertions (Builder $29 flag OFF / Managed $49 + Agency $99 flag ON) already matched the live component. All 8 tests pass unmodified otherwise.

### `clients-new-form.spec.tsx`
1. Added `import "../helpers/dom";` first.
2. Added `removeEventListener(event, fn)` to the file's `FakeEventSource` test double. The live component (`src/app/(dashboard)/clients/new/build-animation/build-stage-v2.tsx:387-393`) calls `es.removeEventListener(...)` in its effect cleanup for every event it subscribes to; the stub only had `addEventListener`, so unmount/re-render threw `TypeError: es.removeEventListener is not a function`. This is a test-fixture gap, not a product bug — a correct `EventSource`-shaped stub needs both halves of the API.
3. Rewrote the first test's assertions (previously `screen.getByTestId("progress-fetching")` / `"progress-extracting"`). The live component's header comment documents an intentional v1→v2 rewrite: "Per-phase fixed sprite frames (the v1 pattern) — v2 is a single archetype-aware canvas that crossfades between 6 phase mocks." There is no `data-testid="progress-*"` markup anywhere in `build-animation/` anymore (confirmed via grep — zero hits). The real signal is `EVENT_TO_MIN_PHASE` driving a `data-phase={index}` + `is-active` class on `PhasePanel` elements: `fetching`/`extracting` both map to phase 0 (SCAN), `soul_built` maps to phase 1 (IDENTITY). Rewrote the test to fire `fetching`, `extracting`, then `soul_built`, and assert `document.querySelector('[data-phase="0"]')`/`'[data-phase="1"]'` gain `is-active` at the right points — preserving the original intent (verify SSE progress drives visible UI state) against the real component contract. Renamed the test title from "renders progress checkmarks as events arrive" to "advances the phase panel as events arrive" to match.

### `create-client-cta.spec.tsx`
Added `import "../helpers/dom";` first. Two tests queried `screen.getByRole("button", { name: /add client workspace/i })` for the under-limit CTA, with a comment claiming base-ui's `Button render={<Link/>} nativeButton={false}` pattern gives the anchor `role="button"`. The live component (`src/components/dashboard/create-client-cta.tsx:120-131`) has a dated comment explaining that pattern was replaced on 2026-05-17: *"replaced `<Button render={<Link/>} nativeButton={false}>` with a plain styled `<Link>`. The base-ui render-prop pattern was swallowing clicks on Next.js Link (button rendered correctly, text visible, but clicks never navigated)."* The current under-limit CTA is a plain `<Link className={buttonVariants(...)}>`, i.e. a real anchor with accessible role `"link"`, not `"button"`. Updated both affected tests (`renders an anchor link...` and `unlimited tier...`) to query `getByRole("link", ...)` and updated the stale comments to reference the 2026-05-17 fix. The third test (`at limit renders a button...`) was already correct — the at-limit branch renders a real `<Button onClick={...}>`, which is a native `<button>`.

## Test results (verbatim tail, combined run)

```
$ node --import tsx --test tests/unit/web-onboarding/upgrade-modal.spec.tsx tests/unit/web-onboarding/clients-new-form.spec.tsx tests/unit/web-onboarding/create-client-cta.spec.tsx

▶ ClientsNewForm
  ✔ submits, opens EventSource, advances the phase panel as events arrive (360.331ms)
  ✔ on error code 412 the form swaps to the BYOK prompt (107.3698ms)
  ✔ on error code 402 the UpgradeModal opens (136.8015ms)
  ✔ on error code 422 the form shows an error banner and keeps the URL filled in (105.6614ms)
✔ ClientsNewForm (710.9496ms)
▶ CreateClientCta
  ✔ renders an anchor link to /clients/new when under the limit (108.2279ms)
  ✔ renders the usage badge with N/M workspaces label (6.1379ms)
  ✔ at limit renders a button (not a link) that opens UpgradeModal on click (62.321ms)
  ✔ unlimited tier (Scale, limit Infinity) renders without N/M and links to /clients/new (6.5535ms)
✔ CreateClientCta (183.9552ms)
▶ UpgradeModal — free tier (add-a-card branch, flag-independent)
  ✔ renders the add-a-card title and subtitle (143.138ms)
  ✔ does NOT render any tier cards on free (24.2086ms)
  ✔ calls onOpenChange(false) when 'Maybe later' is clicked (46.4485ms)
✔ UpgradeModal — free tier (add-a-card branch, flag-independent) (214.6727ms)
▶ UpgradeModal — flag OFF (default) — MINIMAL sellable single target
  ✔ renders Builder ($29) ONLY — not Workspace/Agency (both 409 tier_unavailable), not the new ladder (28.1351ms)
  ✔ interpolates used and limit into the subtitle (24.9099ms)
  ✔ upgrade button POSTs to /api/stripe/checkout with tier:'builder' — the SAME live Stripe price as before (46.3425ms)
✔ UpgradeModal — flag OFF (default) — MINIMAL sellable single target (99.6329ms)
▶ UpgradeModal — flag ON (NEXT_PUBLIC_SF_TIER_LADDER=1) — the new sellable ladder
  ✔ renders Managed ($49) + Agency Starter ($99) — NOT the grandfathered targets (30.1736ms)
  ✔ upgrade buttons POST to /api/stripe/checkout with the NEW ladder tier id (37.7998ms)
✔ UpgradeModal — flag ON (NEXT_PUBLIC_SF_TIER_LADDER=1) — the new sellable ladder (68.179ms)
ℹ tests 16
ℹ suites 5
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3800.6526
```

Per-file counts (also verified individually, matching CI's one-child-process-per-file model):
- `upgrade-modal.spec.tsx`: 8/8 pass
- `clients-new-form.spec.tsx`: 4/4 pass
- `create-client-cta.spec.tsx`: 4/4 pass

## Deviations from the plan and why

1. Added `removeEventListener` to `FakeEventSource` in `clients-new-form.spec.tsx` — not literally "one new helper only," but it's inside one of the three named spec files (in scope) and is a minimal fix to a test double so it matches the real `EventSource` interface the live component calls.
2. Rewrote assertions in `clients-new-form.spec.tsx`'s first test (testid-based checkmarks → `data-phase`/`is-active` panel checks) and in two `create-client-cta.spec.tsx` tests (`role: "button"` → `role: "link"`) per the task's explicit instruction to update tests to match live behavior when the live behavior is clearly intentional. Both cases had a code comment in the live source explicitly documenting the intentional change (the v1→v2 build-animation rewrite; the 2026-05-17 base-ui-Link-swallowing-clicks fix), so I did not treat these as product bugs.
3. Added `window.matchMedia` stub to the new helper (not explicitly listed in the task's global list) — required for `clients-new-form.spec.tsx` to render at all (`idle-scene.tsx` calls it unconditionally). jsdom has no built-in `matchMedia`; without a stub the component throws.

## Open risks

- None identified as product bugs. Both live-source deviations found were pre-documented, intentional changes (dated comments explain the "why"), not regressions.
- Did not touch `packages/crm/tests/setup-dom.ts` (out of scope) — it now duplicates most of `tests/unit/helpers/dom.ts`'s logic minus the `matchMedia` stub. A future cleanup could have one delegate to the other, but that's a refactor outside this task's file list.
