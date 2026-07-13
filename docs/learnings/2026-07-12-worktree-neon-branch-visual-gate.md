# Pre-merge visual gate: worktree dev server + a disposable Neon branch

## The problem, in one line
A branch's UI redesign needed the vision-verify gate (real rendered screenshots, desktop + mobile) BEFORE merge, but the repo's vision tooling screenshots live URLs, a full local `next build` is impossible on this machine, and pointing a dev server at the production DATABASE_URL risks prod writes from a public page that mints sessions on load.

## The approach
1. `git worktree add .claude/worktrees/<slice> -b <branch> origin/main`; junction the main repo's `packages/crm/node_modules` into the worktree (PowerShell `New-Item -ItemType Junction` / `cmd mklink /J`) — no reinstall.
2. Copy the main repo's `packages/crm/.env.local` into the worktree and append the feature flags the page needs (e.g. `SF_RECORD_TO_AGENT=1`).
3. Create a Neon **branch** of the prod project (`create_branch` → `get_connection_string`), swap `DATABASE_URL` in the worktree's `.env.local` to the branch string. The page now has a real schema + data copy and zero prod-write risk.
4. `npx next dev -p 3100` in the worktree (background), probe with `curl.exe` until 200, then screenshot both viewports (1440 and 375, full-page) with the Playwright browser tools.
5. Hand the PNGs to the pinned vision-grader agent with the design-source tokens spelled out in the prompt (hex values, radii, typography, structure) and a strict-JSON pass/gaps contract. Fix majors, re-screenshot, re-grade.
6. Teardown in THIS order: kill/let-die the dev server, remove the junction (removing the junction kills a running dev server — that's fine if the server goes first), delete the copied `.env.local` (it holds secrets + the branch string), delete the Neon branch.

## Judgment calls
- Did NOT push the branch just to get a Vercel preview URL for screenshots — a preview deploy is slower per iteration (minutes vs seconds), depends on preview env flags being set, and publishes work-in-progress commits before the fix-wave loop converged.
- Did NOT screenshot against the production site (it runs the OLD code) or trust jsdom render tests as the visual gate — the two majors the grader caught (an orphaned text line, a wrong button fill) are invisible to DOM assertions.
- Reused the design export's own hardcoded values as the grading rubric instead of inventing one — the mockup IS the spec.

## The reusable rule, one line
For any pre-merge visual gate: worktree + node_modules junction + copied env with a disposable Neon-branch DATABASE_URL gives a prod-faithful, prod-safe render loop in seconds per iteration — and teardown (server → junction → env file → Neon branch) is part of the method.

Related: memory `worktree-typecheck-method`, memory `vision-verify`, learnings `2026-07-12-verify-the-verdict-exists.md`.
