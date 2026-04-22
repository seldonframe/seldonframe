# Follow-up — Workflow runs e2e (Playwright, multi-surface scope)

**Created:** 2026-04-22
**Deferred from:** 2c PR 3 M4 (per L-17 addendum — horizontal infrastructure overrun)
**Target sizing:** ~600-900 LOC its own slice
**Priority:** Medium — ship when Playwright benefits ≥3 surfaces or when a workflow-runs UI regression lands in prod.

## Why this deferred

2c PR 3's audit §8.3 listed a single-consumer Playwright e2e spec for the `/agents/runs` walkthrough. Inspecting the scope revealed the spec itself is ~100-150 LOC, but the supporting infrastructure Playwright requires is ~200-400 LOC:

- `@playwright/test` devDep installation
- `playwright.config.ts` + test isolation layer
- Browser binary install in CI
- Test DB seeding helper (or Neon preview branch per test)
- Auth bypass for the e2e user (or a test-harness login flow)
- CI integration (`pnpm test:e2e` wired into the Vercel check suite)

Per the L-17 addendum captured during the 2c PR 3 stop-and-reassess: bolting this infrastructure into a single-consumer slice under-amortizes the cost and forces a narrow design. Playwright as a horizontal concern serves multiple future surfaces:

## Multi-consumer scope when this ships

Proposed initial spec set (to validate the infrastructure under real use):

1. **Workflow runs walkthrough** — the deferred spec. Start run via MCP → navigate to /agents/runs → observe waiting state → manual resume → observe completion.
2. **Onboarding flow** — new user signup → workspace creation → first contact → Brain v2 prompt visible. Already has unit coverage but no e2e.
3. **Landing page builder** — Puck editor load → drag component → save → published page loads on public URL.
4. **Form submission** — public form render → submit → CRM contact created → event emitted.
5. **Portal flow** — end-client portal login → view assigned resources → send message → message lands in builder inbox.

Target: 5 specs validates the infrastructure carries; no single surface is load-bearing.

## Coverage gap PR 3 ships with

The workflow-runs UI is covered by:

- PR 2 Client Onboarding integration test (283 LOC) — full runtime lifecycle deterministic across 3 runs, event-match + timeout + non-match paths.
- PR 3 M2 endpoint tests (200 LOC) — resume + cancel business logic.
- PR 3 M4 component smoke tests (150 LOC, coming next in this mini-commit) — page module compiles, client component initial-render HTML stable.
- Manual QA — the surface is self-contained enough that a one-time click-through before launch catches the remaining 20%.

What's NOT covered without Playwright:
- Polling refresh loop updates the UI on a real wall-clock interval.
- Sheet drawer open/close interactions across the browser's event loop.
- fetch() + JSON round-trip through Next.js middleware.

These gaps are acceptable for v1 because:
- The polling loop is a 6-line useEffect; unit-level correctness is obvious.
- Sheet is a shadcn/radix primitive already battle-tested by the ecosystem.
- The JSON endpoint is tested by its own unit path (same shape as the server page's data loader).

## Done criteria

- `@playwright/test` added as a workspace devDep.
- `playwright.config.ts` at repo root.
- `pnpm test:e2e` wired into CI (Vercel preview + main).
- At least 3 of the 5 proposed specs passing.
- Test DB seeding utility that's reusable across specs.
- Teardown cleanly between specs (no cross-contamination).
- Flakiness budget: <1% flake rate over 100 consecutive CI runs.

## Related

- `tasks/v1-master-plan.md` §0.5 doesn't gate on Playwright for v1 ship criteria.
- `tasks/step-2c-mid-flow-events-audit.md` §8.3 recommended Playwright for PR 3; scope-cut here per L-17 addendum rule.
