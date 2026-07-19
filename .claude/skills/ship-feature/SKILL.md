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
4. **Build** (`superpowers:subagent-driven-development`) — dispatch a fresh `implementer` subagent (the **maker** — model per the tier table below; effort medium). Brief it with: the regression set named, idempotent + soft-fail where it touches shared paths, migrations additive + journal-clean, DI for offline unit tests, TDD (watch each test fail first), commit-per-task — **first commit at the first coherent unit; a dead session must cost minutes of salvage, not a wave.**
   - **Swarm for breadth:** parallel `scout`/`Explore` agents for recon, parallel per-phase implementers in SEPARATE worktrees where the phases are independent. **One strict checker for depth.**
5. **Verify** — run `/verify-build` as the **controller** (maker ≠ checker — independently re-run the gate; dispatch the `verify-runner` agent, plus `vision-grader` for anything with a visual surface and `smoke-runner` post-deploy). FAIL → hand back to the implementer; never wave it through.
6. **Merge** — only on a green verdict. → **GATE 2: user makes the merge call** (especially with a migration or a behavior change). FF to `main`; confirm the migration count; push.
7. **Memory** — write what was non-obvious to `memory/` (project state, a new constraint); update the roadmap. Distill any correction the user made into a one-line rule in `tasks/lessons.md` so the next loop doesn't re-derive it.

## Token economics — right-size every dispatch

The loop is already fidelity-routed: subagents are drop-and-retrieve (they read big, return a gist), file handoffs are the manifest, `/verify-build` is the gate. The leak is routing mechanical work to expensive models and ignoring the token readout. Lock the tier; contract the output.

### Model tier per role — LOCK THIS (don't re-decide each dispatch)

| role | model | why |
|---|---|---|
| scout · locate-a-fact | `haiku` | Read → return a span; never raw dumps into the controller |
| grader · vision / verify | `haiku` **(pinned)** | Read artifact → `{pass, gaps}`; pinned in the vision-verify skill so it can't drift |
| summarizer · classify | `haiku` | cheap text transform |
| implementer · brief already contains the code | `haiku` | transcription + run the tests |
| implementer · prose brief (the maker) | `sonnet` | writes real code from a spec, effort medium |
| implementer · hard / novel / architectural | `fable` | **generation** is where the best model's edge is load-bearing |
| reviewer · normal diff | `sonnet` | judgment, scaled to the diff's risk |
| reviewer · hot-path · money · auth · schema · concurrency · subtle | `opus` | reads a diff at least as well as `fable` for ~38% of the cost; also decorrelates blind spots when the maker was `fable` |
| final whole-branch review | `opus` | broad, top-tier, once |

- **Spend `fable` (Fable 5) on novel GENERATION, not on reading diffs.** At $10/$50 + its ~30%-heavier tokenizer, a Fable review costs ~2.6× the identical Opus review with no demonstrated catch-rate edge — and Fable's weekly cap makes it an unreliable default. Reviews default to `opus`; escalate a review to `fable` only for a genuinely novel architecture where generation-grade reasoning is required to even understand the diff.
- Prices (per MTok in/out, 2026-07): `haiku` $1/$5 · `sonnet` $2/$10 intro (**$3/$15 from 2026-09-01 — re-audit this table ~Aug 25**) · `opus` $5/$25 · `fable` $10/$50 (+~30% tokenizer). Aliases: `haiku`=Haiku 4.5 · `sonnet`=Sonnet 5 · `opus`=Opus 4.8 · `fable`=Fable 5.
- **Enforcement is mechanical, not discipline:** the pins live in the NAMED AGENT DEFINITIONS in `.claude/agents/` (scout · implementer · reviewer · vision-grader · verify-runner · smoke-runner) — dispatch by `subagent_type` and do NOT pass a model unless deliberately escalating per this table (`fable` for novel generation; `sonnet` for a small normal-diff review). A real session's tier table said `grader → haiku` and the dispatch still ran Sonnet (~218k tokens, the biggest line item) — a locked table enforced by memory isn't locked; a `model:` in agent frontmatter is.
- **Diff-size router:** a ≤~200-line single-task, non-money/auth/concurrency change gets ONE review (skip the per-task + final double-read — they'd read the same lines); `<50 LOC` mechanical fixes can go `haiku`-implementer + one `sonnet` review. Reserve the two-tier review for multi-task branches where the final adds cross-task integration coverage.
- **Right-size the task, not just the model.** Before a read-a-file / hand-a-file-to-a-subagent step, check the size — if it's big, the task is "grep/jq/node the span", never "Read the whole file" (a `haiku` scout handed a 242k-token log just fails). Drop+retrieve at the task level: the controller holds the plan + conclusions; files/greps hold the bytes.
- **Batch the grade wave when nothing blocks on it:** vision-grade fans and other fire-and-forget verification can ride the Batch API (50% off) — a human gate follows anyway, so the async latency is invisible. Never batch interactive stages (recon feeding a live plan, the implementer you're waiting on).

### Output contracts (the 5× slice)

Output is ~5× input price and dominates once input is lean:
- Subagents **report to a file, return only** status + commit shas + a one-line test summary — never paste a full report back into the controller.
- Workflows force structured returns with a `schema:` instead of prose.
- Implementers return **diff-only** edits (`Edit`, not full-file rewrites).
- The controller narrates at most one short line between tool calls — the ledger and tool results carry the record.

### Operational rules
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
