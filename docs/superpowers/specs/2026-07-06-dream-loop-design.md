# 2026-07-06 — `/dream`: a daily, human-gated, out-of-band reflection loop

> Build AFTER the never-lies fix merges — the dream mines the `vision_check` signal,
> so the signal must be truthful (edits actually apply) and gating first. This is the
> Replit "Telescope → self-improvement" loop, scoped to what we can build honestly.

## Objective
Once per day, out-of-band, mine the last 24h of SeldonChat copilot failure signal
(primarily `vision_check pass:false`), cluster the recurring patterns, and **propose**
(never auto-apply) concrete improvements — a lessons entry, a tool-description tweak,
a skill update, or a product "schema-gap" ticket — with a **measured** vision
pass-rate delta so we can tell if dreaming actually helps.

## Why this shape (the honest guardrails, from the cofounder review)
- **Out-of-band, not in-band.** Runs as a scheduled job AFTER the day's work, never
  during a live turn (in-band curation = split focus + stale data — the named
  anti-pattern).
- **Proposes, never auto-applies.** No silent rewrites of CLAUDE.md / lessons /
  skills. Wrong memory is worse than none (recalled facts go stale). Human-gated,
  same discipline as maker ≠ checker.
- **Measured or it didn't happen.** Every dream logs the daily vision pass-rate +
  delta. A dream that doesn't move the real metric is noise. (Ignore the framework's
  "97% fewer errors" marketing; measure OUR baseline.)
- **Deterministic where it can be.** v1 clusters by `trigger_tool` + gap-keyword
  grouping (no embeddings yet — YAGNI; add them when volume demands).
- **Privacy.** Store an instruction SUMMARY, not raw end-customer PII bodies (ties to
  the PostHog "no prompt bodies" stance). v1 surface = the builder's own copilot edit
  requests (low-PII site copy), but redact defensively.

## Prerequisite — persist the signal (it's currently only `console.log`)
`vision_check` is emitted via `logEvent("vision_check", …)` at
`app/api/copilot/turn/route.ts:195,233` — observability only, not queryable. Add a
small table so the dream has clean structured input.

**Migration (additive, one table):** `agent_reflection_events`
- `id uuid pk`, `org_id uuid`, `surface text` ('copilot' | later 'agent:voice'|'agent:chat'),
  `instruction_summary text` (redacted/truncated), `trigger_tool text`,
  `pass boolean`, `skipped text null`, `gaps jsonb`, `created_at timestamptz default now()`,
  index on `(created_at)` and `(pass, created_at)`.
- Written from the copilot turn route right where `logEvent("vision_check")` fires
  (dual-write: keep the log line, add the row). Fail-soft — a persistence error must
  never affect the turn (wrap best-effort, same as the vision block).

## The daily dream (a scheduled **Claude Code routine**, not a Vercel cron)
Rationale: the clustering + synthesis is LLM/subagent work — a Vercel cron has no
harness. Use a `/schedule` cloud routine (or manual `/dream`) that runs the skill
below once/day.

Procedure (`.claude/skills/dream/SKILL.md`):
1. **Collect** — query the last 24h of `agent_reflection_events`: all `pass=false`
   (the failures) + counts of `pass=true` (the denominator). Also pull the day's eval
   failures if cheap.
2. **Cluster** — fan out `haiku` sub-agents to bucket the failures by signature
   (`trigger_tool` + normalized gap phrasing). Return `{cluster, count, exemplars[]}`.
3. **Synthesize** — for each cluster over a threshold (e.g. ≥3/day), classify the root
   cause into one of: **tool-bug** · **field-mapping/context-gap** · **schema-capability-gap**
   · **prompt/instruction-gap**, and propose ONE concrete action:
   - tool-bug → a `tasks/lessons.md` entry + a pointer to the offending tool.
   - context-gap → a proposed tool-description / system-prompt (`cap.ts`) tweak (diff).
   - schema-gap → a product ticket ("users keep asking for X; r1 has no field") — this
     is the demand-driven surface-widening input (Lever A from the customization
     discussion), NOT a code change.
   - prompt-gap → a proposed skill / instruction refinement (diff).
4. **Propose (human-gated)** — write `docs/dreams/YYYY-MM-DD-dream.md` with the
   clusters, root-cause classification, and staged diffs. Surface the diffs for
   approval (spawn_task / a PR). **Apply nothing automatically.**
5. **Measure** — append to `docs/dreams/self-reflection-log.md`: date, total turns,
   vision pass-rate, delta vs prior day, #clusters, #proposals, #approved-since-last.

## Decisions (defaults chosen; confirm at spec approval)
- **Cadence:** once/day (per Max). Late-night local, after the day's traffic.
- **Runner:** `/schedule` Claude Code routine (LLM + subagents). A thin Vercel cron
  could snapshot the pass-rate metric, but the reasoning lives in the routine.
- **v1 scope:** the copilot builder surface only (we have the signal + it's where the
  bug lived). Extending the same table + dream to **deployed customer agents** is the
  higher-leverage PRODUCT play (self-improving Brain v2) — deliberately deferred to a
  follow-up so v1 stays honest and small.
- **Auto-apply:** none in v1. Once we trust it, MAYBE auto-apply the lowest-risk class
  (a new lessons.md entry) behind a flag — never CLAUDE.md/skills.

## Validation / stop condition
- `/verify-build` green (migration = the one additive table, journal clean; the
  persistence dual-write covered by a unit test; fail-soft asserted).
- One real dream run over seeded/real `agent_reflection_events` produces a dated report
  + at least one correctly-classified cluster (e.g. it would have surfaced today's
  "update_section_field pass:false on r1" cluster and proposed the exact fix we shipped).
- Independent review (sonnet — it's additive + human-gated, low blast radius; opus only
  if the persistence touches the hot turn path in a risky way).
- Human merge gate.

## The self-referential proof
This session we ran ONE iteration of this loop BY HAND: `vision_check` caught the
"Done ✅" lie → I clustered it → root-caused it (slug='home' vs 'r1') → shipped the fix
→ captured the lesson. `/dream` automates the detect + cluster + propose steps so the
next such class surfaces without a human noticing it in a screenshot first.
