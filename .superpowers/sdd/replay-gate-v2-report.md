# Replay gate v2 — idempotent-send — build report

## Files changed

New:
- `packages/crm/drizzle/0077_replay_gate_v2.sql`
- `packages/crm/src/db/schema/replay-send-claims.ts`
- `packages/crm/src/lib/deployments/replay/gate-v2.ts`
- `packages/crm/src/lib/deployments/replay/send-claim.ts`
- `packages/crm/tests/unit/deployments/replay/gate-v2.spec.ts`
- `packages/crm/tests/unit/deployments/replay/replay-gate-v2-execution.spec.ts`
- `packages/crm/tests/unit/deployments/replay/send-claim.spec.ts`

Modified:
- `packages/crm/drizzle/meta/_journal.json` (registers 0077)
- `packages/crm/scripts/replay-ops.ts` (new `set-idempotency` command; `list-skills` shows idempotency)
- `packages/crm/src/db/schema/agent-workflow-traces.ts` (`AgentWorkflowTraceKind` gains `'replay-run-failed-post-send'`)
- `packages/crm/src/db/schema/index.ts` (barrel export for `replay-send-claims`)
- `packages/crm/src/db/schema/replay-skills.ts` (`idempotency` jsonb column + `ReplaySkillIdempotency` type)
- `packages/crm/src/lib/deployments/composio-event-dispatch-deps.ts` (`persistReplayRun` maps `failed-post-send` → the new trace kind)
- `packages/crm/src/lib/deployments/replay/replay-before-llm.ts` (v2 branch: `attemptV2Replay`, `wrapToolWithSendClaim`, `trustedEffect` now exported, new `failed-post-send` result kind)
- `packages/crm/src/lib/deployments/replay/replay-or-turn.ts` (handles `failed-post-send`: never calls `runTurn`)
- `packages/crm/src/lib/web-build/policy.ts` (`isReplayGateV2On`)
- `packages/crm/tests/unit/deployments/replay/replay-or-turn.spec.ts` (failed-post-send tests)
- `packages/crm/tests/unit/deployments/replay/replay-skills-schema.spec.ts` (idempotency column + migration 0077 section)
- `packages/crm/tests/unit/web-build-policy.spec.ts` (flag test)

## Idempotency-key storage decision (as requested by the brief)

**Chosen: out-of-band, on `replay_skills.idempotency` (nullable jsonb `{stepN, keyVar}`)** — NOT inside `skill_md`.

Why: verified directly against the installed `@seldonframe/reelier@0.2.0` dist
(`node_modules/@seldonframe/reelier/dist/skill.js`, confirmed byte-identical to the
0.2.1 source repo on this point) — `parseSkill`'s step-block grammar only recognizes
`intent|action|assert|bind|effect` bullets; any other `- key:` line throws
`SkillParseError("Unrecognized step field...")`. An `- idempotency-key: {{message_id}}`
bullet as sketched in the spec would make the skill unparseable. Forking reelier (an
external npm dependency shared by other consumers) was rejected. The out-of-band
column mirrors the exact precedent `trigger_filter` set in migration 0076 for the same
class of problem ("a linear skill needs scoping metadata reelier's grammar has no room
for"). Validated by `gate-v2.ts`'s `validateIdempotencyConfig` (same shape/contract as
`trigger-filter.ts`'s `validateTriggerFilter`) and set via the new
`replay-ops.ts set-idempotency <skillId> --step <N> --key-var message_id` command,
which reuses `passesGateV2` — the SAME function replay-time uses — so a config accepted
by the CLI is guaranteed to pass at replay time too.

## A safety gap found and closed during implementation (not in the original spec)

Reelier's own `runSkill` refuses to execute ANY step whose **raw compiled** `effect:
destructive` line is set unless the caller passes `allowDestructive: true` for the
whole run — this check is independent of SF's tool-effects.ts allowlist. v1 always
passes `allowDestructive: false`. v2 needs `true` so the one gate-validated destructive
step can actually execute for real (found this by literally running the real reelier
package against a v2 fixture — the "happy path" test initially came back
`failed-post-send` with `"Refusing to execute destructive step without --yes"`).

Setting `allowDestructive: true` for the whole run creates a real bypass: if some OTHER
step's **raw** compiled effect also happens to say `destructive` (a compiler
misclassification, or a hand-edited skill_md) — even if SF's own allowlist trusts that
tool as `read`/`idempotent-write` — it would now execute for real WITHOUT ever going
through the claim wrapper (only the ONE declared destructive step's tool is wrapped).

Closed this in `gate-v2.ts`'s `passesGateV2`: v2 eligibility now ALSO requires that
every step other than the declared destructive one has a raw `step.effect !==
"destructive"` (not just an allowlist-trusted effect of read/idempotent-write). Any
skill that fails this additional check refuses v2 eligibility and falls through to v1
(safe — v1 never sets `allowDestructive: true`).

## Execution design

`attemptV2Replay` (module-private, `replay-before-llm.ts`) reuses the REAL
`@seldonframe/reelier` `runSkill` unmodified — same tool registry, allowlist, template
fill, and assert loop v1 uses — with exactly one delta: the declared destructive step's
tool is wrapped by `wrapToolWithSendClaim`, which:
1. Calls `claimSendStep` (INSERT `replay_send_claims`, outcome=`unknown`) before
   executing anything.
2. `already-claimed` (lost the unique-index race, or a redelivery) → does NOT execute
   the real tool; returns a synthetic 200 observation so the run keeps going (post-send
   steps still execute for real — redelivery convergence).
3. `claim-error` (ambiguous — DB couldn't confirm) → throws, refusing to execute.
   Fails closed.
4. Claimed → executes the real tool. A `status >= 400` result is ALSO thrown (v2 never
   trusts the compiled skill's own assert coverage for the one step with real-world
   consequences), marking the claim `failed`; success marks it `sent`.

`attemptL0Replay` then classifies any divergence by comparing the first `failed` step's
number to the declared `destructiveStepN`: strictly before → `kind: "diverged"` (today's
v1 fallback semantics, unchanged); at or after → `kind: "failed-post-send"` (spec §3's
asymmetric policy — `replay-or-turn.ts` never calls `runTurn` for this kind, returning
`{ok:false, errorMessage}` instead, which reuses the EXISTING receipt-writing plumbing
for the "loud receipt note" the spec calls for — no new receipt code needed).

`maxLevel` stays `0` unconditionally in both v1 and v2 paths (unchanged literal), so
reelier's own escalation ladder is structurally unreachable — it never constructs an
LLM client at `maxLevel: 0`, confirmed by reading `runner.ts`'s `attemptEscalation`.

## Deviation from the brief's literal wording

Brief asked for a "distinct marker field" alongside `kind='replay-run', ok=false`. I
instead added a new value to the EXISTING `agent_workflow_traces.kind` column
(`'replay-run-failed-post-send'`) rather than adding a new column. That column has no
DB CHECK constraint (confirmed in migration 0075 — plain `text`), so this needed no
migration, and `kind` is already the field that distinguishes trace shapes — this is
the more consistent, lower-surface-area choice. Documented in
`agent-workflow-traces.ts`'s updated JSDoc.

The `replay_send_claims.outcome` enum includes `'skipped-claimed'` (per the brief's
literal spec) even though no row is ever actually WRITTEN with that value — a losing
claim attempt's INSERT never succeeds at all (that's the whole point of the unique
index), so `'skipped-claimed'` describes a STEP-record label (used in `attemptL0Replay`'s
`toolCalls` note and read via the `events.skippedClaimed` side-channel), not a value
that appears in the claims table itself. Documented in the schema file's JSDoc.

## Test results (verbatim tail)

Replay + policy suite (209 tests, includes all new v2 tests):
```
✔ resolveWebBuildRateLimit: env override with strict fallback (12.9502ms)
ℹ tests 209
ℹ suites 56
ℹ pass 209
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1157.0081
```

`tsc --noEmit`: 1 error, pre-existing on the base branch
(`src/app/api/copilot/turn/route.ts(315,9)`, unrelated `'persist'` property — confirmed
present before any of my changes via `git stash` + rerun). Zero NEW errors introduced.

`pnpm run check:use-server`: `✓ All 'use server' files export only async functions / types.`

Broader `deployments/*.spec.ts` sweep (360 tests, sanity check that
`composio-event-dispatch-deps.ts`'s edit didn't regress anything): 359 pass, 1
pre-existing unrelated failure (`deploy-readiness.spec.ts` — a brand-copy string
mismatch, "Seldon" vs "SF" wording drift, nothing to do with this change).

Full-repo `scripts/run-unit-tests.js` hits the documented Windows `ENAMETOOLONG` (772
spec files as argv — pre-existing platform limitation, memory:
`crm-unit-test-harness`). Batched manually instead; batches touching DB integration
tests hit expected `ECONNREFUSED` against a local Neon endpoint (pre-existing baseline,
memory: `green-main-ci-fix-2026-07-10` — "remaining red = DB-bound Neon baseline").

Migration/journal consistency: verified via
`replay-skills-schema.spec.ts`'s new "migration 0077" describe block (checks the SQL
file's ALTER/CREATE TABLE/UNIQUE INDEX statements match the Drizzle schema, and that
the journal registers 0077 immediately after 0076) — all green in the 209-test run
above.

## Open risks / follow-ups

1. **Not staging-drilled.** Spec §Rollout item 3 (10 consecutive live emails, assert
   exactly one forward per messageId) is explicitly a LATER step gated on Max review of
   a recompiled forwarder skill — out of scope for this build.
2. **`ReelierObservation.status >= 400` as the sole send-failure signal.** This is a
   deliberate choice (v2 never trusts assert coverage for the send step), but means a
   tool that returns a non-JSON/non-HTTP-shaped "failure" without a `status` field
   >= 400 would not be caught by this check — bounded by the fact that
   `defaultBuildTools`' wrapper (unchanged, v1) already normalizes every tool result to
   `{status, headers, body}`, so this only matters for a future custom tool bridge.
3. **The `claim-error` (ambiguous DB failure) path fails closed by refusing to send**,
   which is safe but means a transient DB blip during exactly the claim-insert moment
   turns into a `failed-post-send` run needing manual attention rather than a silent
   retry. Accepted as the conservative default per the spec's "never risk a double-send"
   framing — not revisited here.
4. Ops CLI's `set-idempotency` has no dedicated test file (mirrors the existing
   `replay-ops.ts`, which also has none — script is exercised indirectly via
   `passesGateV2`, which IS unit-tested). If this becomes a heavier-traffic surface,
   worth a dedicated spec later.

## Worktree

`C:\Users\maxim\CascadeProjects\Seldon Frame\.claude\worktrees\agent-a2db413932da348e3`
Branch: `feat/replay-gate-v2` (based on `origin/chore/replay-trace-unification`,
commit `4eb74fcb2`). Not pushed, no PR opened, as instructed.

## Diff stat

```
 packages/crm/drizzle/0077_replay_gate_v2.sql       |  41 ++
 packages/crm/drizzle/meta/_journal.json            |   7 +
 packages/crm/scripts/replay-ops.ts                 | 100 ++++-
 .../crm/src/db/schema/agent-workflow-traces.ts     |  12 +-
 packages/crm/src/db/schema/index.ts                |   2 +
 packages/crm/src/db/schema/replay-send-claims.ts   |  71 ++++
 packages/crm/src/db/schema/replay-skills.ts        |  20 +
 .../deployments/composio-event-dispatch-deps.ts    |   6 +-
 packages/crm/src/lib/deployments/replay/gate-v2.ts | 160 ++++++++
 .../lib/deployments/replay/replay-before-llm.ts    | 341 +++++++++++++++-
 .../src/lib/deployments/replay/replay-or-turn.ts   |  28 +-
 .../crm/src/lib/deployments/replay/send-claim.ts   | 126 ++++++
 packages/crm/src/lib/web-build/policy.ts           |  13 +
 .../tests/unit/deployments/replay/gate-v2.spec.ts  | 150 +++++++
 .../replay/replay-gate-v2-execution.spec.ts        | 445 +++++++++++++++++++++
 .../unit/deployments/replay/replay-or-turn.spec.ts |  35 ++
 .../replay/replay-skills-schema.spec.ts            |  66 +++
 .../unit/deployments/replay/send-claim.spec.ts     | 115 ++++++
 packages/crm/tests/unit/web-build-policy.spec.ts   |   9 +
 19 files changed, 1715 insertions(+), 32 deletions(-)
```

Commit: `3c74234d6` — "feat(replay): gate v2 — idempotent-send with claim ledger and
asymmetric fallback (migration 0077, SF_REPLAY_GATE_V2)"
