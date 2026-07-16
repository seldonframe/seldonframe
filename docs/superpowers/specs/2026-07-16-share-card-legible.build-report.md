# Share-card legibility fix — build report

Branch `fix/share-card-legible-steps` @ base `8ff2a1394` → `edfe0835d`.

## Per-task shas

| Task | Sha | Summary |
| --- | --- | --- |
| 1 — SharePipelineSvg legibility | `55d05f78f` | Extracted pure `layoutPipeline(steps)`: caps displayed nodes at 5 (first 4 + a `"+N more steps"` node), wraps into rows (max 3/row) so the viewBox grows in HEIGHT instead of shrinking per-step WIDTH. Node dimensions (`STEP_WIDTH`/`STEP_HEIGHT`) are now constants regardless of step count. |
| 2 — brand pass | `edfe0835d` | Retired emerald `#2fd18d` → forest brand pairing on `/a/[slug]/page.tsx` (cream CTA bg + forest ink text, muted kicker, warm node border) and on the OG `agent-share` card's step-node fill/border in `lib/seo/og-card.tsx` (`#1c2230`/`#3a4256` → `#1A1713`/`#4A4032`, matching the SVG). |
| 3 — vision gate + regression | this file | See below. |

## Files changed

- `packages/crm/src/components/share/share-pipeline-svg.tsx` (rewritten: pure `layoutPipeline` export + row-wrap render)
- `packages/crm/tests/unit/share/share-pipeline-svg.spec.ts` (new: 1/3/5/9-step layout geometry, worst-case 12px legibility floor, L-36 visibility invariant on rendered markup)
- `packages/crm/src/app/a/[slug]/page.tsx` (color swap only)
- `packages/crm/src/lib/seo/og-card.tsx` (`AgentShareCard` node colors only)

## Root cause (confirmed)

`SharePipelineSvg` set `viewBox` width = `count * STEP_WIDTH` while rendering `<svg width="100%">` with no fixed height. With no `preserveAspectRatio` override, the browser scales the whole graphic to fit the container width using `viewBoxHeight / viewBoxWidth` as the ratio — so every additional step shrank ALL steps together (fontSize 14 viewBox-units → ~7px at 6+ steps). Fix wraps into rows instead, keeping viewBox width bounded by the widest row (≤3 nodes) and growing only in height.

## OG route finding

`app/api/og/route.tsx` → `lib/seo/og-card.tsx`'s `AgentShareCard` (`kind=agent-share`) was already capped at 4 steps and used `flexWrap` layout (satori/`ImageResponse`, not an SVG viewBox) — it did NOT have the shrink-with-count bug. Per the plan's "if structured completely differently, fix colors + cap only, minimal diff" branch: only the retired navy/emerald node colors (`#1c2230`/`#3a4256`) were swapped for the same elevated-dark/warm-border pair used by the fixed SVG (`#1A1713`/`#4A4032`). Cap left at 4 (not renamed to 5+"+N more") since it already reads clearly and touching the cap logic would be scope creep on a component that isn't broken.

## Vision gate

Rendered 3-step and 9-step fixtures (via `react-dom/server` + a static-markup HTML wrapper matching the `/a` page's dark card) at a 640px container, screenshotted via Playwright (the Claude Browser pane's `computer` screenshot action was hanging/timing out in this session — infra issue, not content-related; verified with `example.com` too). Dispatched `vision-grader` against the rubric (readable labels, distinct "+N more" node, no emerald, brand-consistent, no cramping). **Round 1: PASS, no gaps.**

## Test results

Targeted suite (`share-pipeline-svg`, `scrub-step-label`, `og-card`, `build/share-card`, `agent-templates/share-card-actions`, `activation/share`, `recordings/share-target`, `seo/share-state`): **119/120 pass.** The one failure (`tests/unit/activation/share.spec.ts`) is a pre-existing `MODULE_NOT_FOUND: qrcode` baseline gap in the junctioned node_modules — unrelated to any touched file, not a regression.

`tsc --noEmit`: identical 10 pre-existing errors before and after (verified via a detached `git worktree add --detach 8ff2a1394` base copy, diffed byte-for-byte against the branch tip — zero delta). None touch the 4 files in this slice.

`pnpm check:use-server`: `✓ All 'use server' files export only async functions / types.`

## Incident (resolved) — accidental node_modules wipe

While cleaning up the `packages/crm/node_modules` junction I created (per the documented worktree-typecheck-method), a PowerShell `(Get-Item $path).Delete()` call on the junction followed it into the **guardian** worktree and recursively deleted its `packages/crm/node_modules` CONTENTS (0 items left) instead of just unlinking the junction — collateral damage outside this slice's scope, caused by a `.NET DirectoryInfo.Delete()` footgun on reparse points (it does NOT behave like `rmdir` at the junction boundary the way the memory note's `cmd /c rmdir` guidance assumes). Restored via `pnpm install --filter ./packages/crm` in the guardian worktree (85s, 100% pnpm-store reuse, 0 downloads) — verified back to 65 top-level entries (matches the main checkout's own count) including `jsdom`/`tsx`, and the share-card test suite re-ran green against it before final junction removal via the safe `cmd /c rmdir` (unlink-only, confirmed guardian untouched afterward, 65 entries).

**Lesson for next session:** never call `.Delete()` on a `System.IO.DirectoryInfo` object obtained via `Get-Item` for a junction/reparse point cleanup — it can recurse into the target. Use `cmd /c rmdir "<path>"` (no trailing slash, exact junction path) exclusively; verify emptiness of the **target** afterward, not just `Test-Path` on the link.

## Open risks

None for the shipped diff. The Browser-pane `computer` screenshot tool was non-functional this session (hung on trivial pages too) — worth a follow-up if it recurs, but Playwright MCP was a working substitute.
