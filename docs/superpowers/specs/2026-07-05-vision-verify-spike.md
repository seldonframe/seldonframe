# Vision-Verify — Spike Scope (2026-07-05)

## Problem
We verify UI/visual work at the **code** level (reviewers reason about CSS/JSX); we never verify by **seeing** the rendered result. This session alone — the mobile overflow fix, the hero background renderer, the design picker, media backgrounds — all verified in code, none seen. The `hero-has-bg-wrap` regression was caught by CSS-specificity *reasoning* (lucky); a pixel check catches that class instantly and catches what reasoning can't: contrast, overlap, broken images, layout shift, empty sections. Our Chrome-MCP screenshot path is unreliable (the `clip.scale` CDP bug + backgrounded-tab 0-viewport), so "just screenshot it" is not a foundation.

## Two applications, one engine
1. **Internal build-loop gate** — maker≠checker applied to *pixels*. For a UI-affecting change: render the affected route headless → screenshot → an **independent** vision-grader compares against the goal + a rubric → `{pass, gaps[]}`. Catches visual regressions before merge, the way our text reviewers catch logic bugs.
2. **Product feature — the never-lies pillar, made mechanical**
   - **SeldonChat post-edit confirm:** after an edit lands, screenshot the `/w/[slug]` preview → vision-check "did the change land + look right?" → only *then* say "done." (Today it declares done on tool-success, never seeing the result — the exact gap the "seldonchat doesn't work as I asked" reports came from.)
   - **Generation gate:** vision-verify a freshly-generated site before "your site is ready" — catch broken hero images, empty sections, contrast fails, garbled layout.

## Architecture (3 pieces)
- **Render** — headless Chromium, NOT the flaky Chrome-MCP.
  - Dev loop: a Playwright script (local/CI) → screenshots a URL at 375 + 1280.
  - Product/serverless: `puppeteer-core` + `@sparticuz/chromium` on a Vercel function, OR an external screenshot service (**microlink** — already used for seldonstudio thumbnails) to dodge the serverless-Chromium bundle/cold-start pain.
- **Grade** — a vision-capable model (Claude vision) as an **independent** grader subagent: `(screenshot + goal + rubric) → { pass: bool, gaps: string[] }`. The maker never grades its own pixels.
- **Loop** — render → grade → if fail, hand the gap back to the maker/copilot → re-render → until pass or max-iterations (the `/goal`-style objective stop).

## Where it plugs in
- Internal: a `vision-verify` skill / a step in `verify-build`, invoked by the controller for UI tasks (or a Dynamic-Workflow stage).
- Product: a flag-gated post-edit hook in the copilot turn + a flag-gated gate in the generation pipeline.

## Cost / risk
- Serverless headless Chromium is heavy → prefer microlink / a dedicated render worker for the **product** path; Playwright is fine for the **dev** loop.
- Vision grading = latency + tokens → a *gate*, not per-keystroke. Use a cheap vision model (Haiku) where the rubric is simple.
- Grader false pos/neg → rubric quality is everything; keep rubrics specific + per-surface (hero rubric ≠ pricing-table rubric).

## The spike (prove the unknowns first)
- **Phase 0 — reliable render.** Screenshot a given `/w/[slug]` at 375 + 1280 → PNG. Prove reliable capture (the thing Chrome-MCP can't do here). Fastest path: microlink against a live deployed page.
- **Phase 1 — a grader that catches a real defect.** The vision-grader: feed it a deliberately-broken hero (a video URL in an `<img>`, or a no-contrast overlay) → it flags the defect; feed a good one → it passes.
- **Phase 2 — wire into the build loop** as an optional UI-task verify step.
- **Phase 3 — product**: SeldonChat post-edit vision-confirm (flag) + generation gate (flag).

**Recommendation:** run **Phase 0+1** as the spike — that's the risk. Reliable headless render + a grader that demonstrably catches a real visual defect. If those hold, 2-3 are wiring.
