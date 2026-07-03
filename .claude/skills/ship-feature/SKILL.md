---
name: ship-feature
description: Run the full SeldonFrame feature loop — brainstorm → spec → plan → subagent build → verify-build → merge → memory — stopping only at the two human gates (spec approval + merge). Invoke with a one-sentence feature description.
---

# /ship-feature — the feature loop

Codifies the loop this repo ships features with, so a feature is one sentence instead of a re-explanation. Runs the cycle autonomously, stopping ONLY at the two decisions a human owns.

**Input:** a one-sentence feature description (e.g. "deploy a chat agent that books into the client workspace").

## The loop
1. **Brainstorm** (`superpowers:brainstorming`) — explore the codebase context, ask the user clarifying questions ONE at a time, propose 2–3 approaches with a recommendation. → **GATE 1: user approves the design.**
2. **Spec** — write `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`. Ground every recon-dependent assumption by actually reading the code (dispatch an `Explore` agent for the seam — don't guess). Commit.
3. **Plan** (`superpowers:writing-plans`) — bite-sized TDD tasks, exact files + code, commit-per-task; `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`. Commit.
4. **Build** (`superpowers:subagent-driven-development`) — dispatch a fresh `implementer` subagent (the **maker**; Fable, effort medium). Brief it with: the regression set named, idempotent + soft-fail where it touches shared paths, migrations additive + journal-clean, DI for offline unit tests, TDD (watch each test fail first), commit-per-task — **first commit at the first coherent unit; a dead session must cost minutes of salvage, not a wave.**
   - **Swarm for breadth:** parallel `scout`/`Explore` agents for recon, parallel per-phase implementers in SEPARATE worktrees where the phases are independent. **One strict checker for depth.**
5. **Verify** — run `/verify-build` as the **controller** (maker ≠ checker — independently re-run the gate). FAIL → hand back to the implementer; never wave it through.
6. **Merge** — only on a green verdict. → **GATE 2: user makes the merge call** (especially with a migration or a behavior change). FF to `main`; confirm the migration count; push.
7. **Memory** — write what was non-obvious to `memory/` (project state, a new constraint); update the roadmap. Distill any correction the user made into a one-line rule in `tasks/lessons.md` so the next loop doesn't re-derive it.

## Token economics (the 2-3x rules)

- **Model tiering:** Fable ONLY plans and builds. Exploration → `scout`
  (Opus low, read-only, condensed summaries — never raw file dumps into the
  planner's context). Diff review → `reviewer` (Opus high, fresh context).
  Review is priced by risk: money/security/auth/schema diffs get Opus-high;
  mechanical diffs get one cheap pass. The verify gate runs for everything.
- **One wave per deploy, one publish per session:** batch all finished,
  reviewed work into ONE fast-forward push to main per deploy cycle; npm
  version bumps (`skills/mcp-server`) ride the LAST wave so the human runs
  `npm publish` + 2FA exactly once. Never have them publish, then bump.
- **Deploy time = recon time:** a Vercel build in flight means the next
  build's scout or a live-smoke watcher is already running in the background.
  Post-deploy, verify against a cheap unambiguous marker (a changed response
  field, an auth code) before burning rate-limited smoke actions.
- **Session-cap discipline:** at most one heavyweight background implementer
  near the usage cap; inline edits beat a subagent below ~100 changed lines;
  on any cap warning, commit WIP immediately and shrink to inline.
- **Human actions arrive as ONE batch:** publishes, env vars, submissions,
  approvals — a single consolidated queue per wave, never a dribble.

## The two gates (the only places this stops)
- **Spec approval** — the user confirms the design before a plan is written.
- **Merge** — the user makes the merge/deploy call.

Everything between runs without check-ins. Don't ask "should I continue?" — execute.

## Rules
- **Loop the build, keep the judgment.** This skill ships well-specified BUILD work. Strategy, positioning, and "which approach" calls stay with the user — never loop judgment.
- **Maker ≠ checker** is non-negotiable — the agent that built it does not verify it.
- Only run the full loop when the work is non-trivial (3+ steps / a migration / shared-path changes). A one-line fix is just a fix.
- Read `tasks/lessons.md` at the start of every run — it's the constraints file that makes the loop smarter run-over-run.
