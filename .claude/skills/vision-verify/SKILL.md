---
name: vision-verify
description: Visually verify a rendered web page against a goal + rubric — screenshot it (reliable off-box render, NOT the flaky Chrome-MCP), then grade the pixels with an INDEPENDENT vision pass. Use for any UI/visual change before calling it done, or to confirm a fix landed on a live/preview page. Catches what verify-build + code review can't SEE: contrast, overlap, broken images, layout shift, duplicated elements.
---

# vision-verify — the visual gate

`verify-build` proves a change *compiles and passes tests*. It cannot prove the
page *looks right* — code review reasons about JSX/CSS, it never sees the result.
This skill closes that gap: **render → screenshot → an independent visual grade
against a rubric.** It is the visual complement to `verify-build`, not a
replacement — run both for UI-affecting work.

**Proven 2026-07-05:** caught a duplicate "Services" nav item on a live r1 site
that unit tests, tsc, `next build`, AND two code reviews all missed — then
confirmed the fix by re-screenshot. First bug on SF caught by *seeing*, not
reasoning about code.

## When to use
- After ANY UI-affecting change, before "done" — especially landing/site render
  (hero, nav, sections), the dashboard shell, or anything themed.
- To confirm a fix visually landed on a live/preview URL (the found → fix →
  **confirm** loop).

## Steps

1. **Get a public URL** to the page — a deployed `/w/<slug>`, the
   `<slug>.app.seldonframe.com` subdomain, or a Vercel preview URL. It must be
   publicly reachable (the renderer fetches it). If you just pushed a fix, first
   confirm the deploy is live: `curl -s https://app.seldonframe.com/api/version`
   → the `sha` should be your commit (else wait for the deploy).

2. **Render** (from `packages/crm`), at desktop and — for anything responsive —
   mobile:
   ```
   node scripts/vision-shot.mjs <url> /tmp/vv-desktop.png 1280
   node scripts/vision-shot.mjs <url> /tmp/vv-mobile.png 390
   ```
   It cache-busts so a just-deployed change is captured fresh. Prints the saved
   path. (Set `MICROLINK_API_KEY` for higher rate limits; the free endpoint works
   without it, but can rate-limit on rapid retries — space them out.)

3. **Grade — independent (maker ≠ checker), on `haiku` — PINNED.** Dispatch a
   vision-grader SUBAGENT (Agent tool, **`model: "haiku"` — do not override**)
   that `Read`s the PNG and grades it against the goal + a rubric, returning
   `{ pass: boolean, gaps: string[] }`. Read-a-PNG→verdict is haiku work; a
   real session ran 4 graders on sonnet (~218k tokens — the session's biggest
   line item) purely because the model was left to dispatch-time habit. The pin
   lives HERE so it can't drift. (If haiku ever provably misses what sonnet
   catches — run 10 known-good + 10 known-bad screenshots — change the pin
   here, on evidence, not per-dispatch.)
   Do NOT let the code's author grade its own pixels — a fresh grader sees only
   the artifact + the rubric, with no stake in the maker's reasoning. For a
   quick self-check inline, `Read` the PNG yourself — but a real gate uses a
   separate grader.
   **Prefer a before/after DIFF grade when a baseline exists:** hand the grader
   both screenshots and ask "what changed — is the change the requested one,
   and did anything regress?" A visual diff is more sensitive to regressions
   (the duplicate-nav class) and less subjective than an absolute grade.

4. **Act.** Pass → done. Gaps → feed each gap back to the maker → re-render →
   re-grade until pass or a hard iteration cap (an objective stop, like `/goal`).

## Rubric (adapt per surface)
Generic: renders with no broken images / empty sections; text is legible
(contrast); nothing overlaps or overflows the viewport (no horizontal scroll);
**no duplicated nav/section elements**; the specific change requested is visibly
present; nothing is truncated mid-word in a jarring way.

Per-surface hints:
- **Hero:** headline hierarchy clear; subhead + CTAs legible; any
  lead-form-in-hero renders; a set background sits BEHIND text with a legibility
  veil (never washing out the copy).
- **Nav:** exactly one of each item (the duplicate-"Services" class of bug);
  wordmark + phone/CTA present.
- **Pricing / tables:** columns aligned; numbers tabular; no clipped cells.
- **Dashboard shell:** no sideways scroll; the summary reads before the detail.

## Notes
- The Chrome-MCP `screenshot` path is unreliable here (CDP `clip.scale` +
  backgrounded-tab 0-viewport) — use `vision-shot.mjs`.
- **Product version (next build):** the same render+grade engine, server-side,
  becomes SeldonChat's "confirm the edit looks right before I say done" and a
  gate in the site-generation pipeline — the never-lies pillar made mechanical.
  Spec: `docs/superpowers/specs/2026-07-05-vision-verify-spike.md`.
