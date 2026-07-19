---
name: dream
description: Daily out-of-band reflection — mine the last 24h of SeldonChat vision_check failures, cluster them, and PROPOSE (never auto-apply) lessons / tool-desc / schema-gap fixes, with a measured pass-rate delta. Run once/day via a schedule, or manually to reflect now. The Telescope→self-improvement loop, scoped to what we can verify honestly.
---

# /dream — the daily reflection loop

Turns the `vision_check` signal into systematic improvement instead of a human
spotting bugs in screenshots. Runs AFTER the day's work (out-of-band), reads what
failed, and hands back **proposals a human approves** — never silent self-edits.

**Precondition:** the signal must be truthful. `/dream` mines `vision_check`
verdicts; if the verifier lies (false positives OR false negatives), the loop
learns garbage. Never weaken the verifier to make a cluster go away.

## The five guardrails (do not violate)
1. **Out-of-band.** Runs on a schedule / on demand, never inside a live turn.
2. **Proposes, never auto-applies.** No edits to CLAUDE.md / lessons / skills /
   tool descriptions without a human approving the diff. Wrong memory is worse
   than none.
3. **Measured or it didn't happen.** Every run logs the daily vision pass-rate +
   delta. A dream that doesn't move the real metric is noise.
4. **Deterministic where possible.** v1 clusters by `trigger_tool` + gap keywords
   (no embeddings — add them only when volume demands).
5. **Privacy.** Work from `instruction_summary` (already truncated at persist);
   never surface raw end-customer PII in a report.

## Steps

### 1. Collect
Pull the last 24h of reflection events from the **CRON_SECRET-authed export
endpoint** (so this run needs NO database credentials — only the secret):
```
curl -s -H "x-cron-secret: $CRON_SECRET" \
  "https://app.seldonframe.com/api/cron/dream-collect?sinceHours=24"
```
It returns `{ since, window_hours, summary: { total, failures, skipped, pass_rate }, count, reflections: [...] }`.
The server already computes the metric (`summary`) via `summarizeReflections`;
`reflections` are the raw rows to cluster. If `CRON_SECRET` is unset the endpoint
401s — report that and stop. If `summary.failures === 0`, log the metric and STOP
(a clean day — nothing to propose). (`CRON_SECRET` is already set in Vercel; the
run environment just needs the secret value, not DB access. The underlying query
is `collectRecentReflections` / `summarizeReflections` in `packages/crm/src/lib/vision/`.)

### 2. Cluster (fan out — haiku)
Group `failures` by signature: `trigger_tool` + normalized gap phrasing. For each
group, dispatch a `haiku` sub-agent that returns `{ cluster_label, count,
exemplars[], likely_root_cause }`. Keep it cheap — read the rows, return a gist.
Only clusters with `count >= 3` (a real pattern, not a one-off) go to step 3.

### 3. Classify + propose (one proposal per cluster)
For each qualifying cluster, classify the root cause into ONE of:
- **tool-bug** → the tool wrote the wrong/dead model or lied. Propose a
  `tasks/lessons.md` entry + the offending file:line. (This is how today's
  slug='home' bug would have surfaced automatically.)
- **context-gap** → the model picked the wrong field/tool. Propose a
  tool-description or `cap.ts` persona tweak (as a diff).
- **schema-gap** → users keep asking for something the r1 schema can't express
  (e.g. "a video under the headline", "move the form left"). Propose a **product
  ticket**, NOT a code change — this is the demand-driven signal for which fields
  to widen next (the answer to "why not just add more tools": add them from data).
- **verifier-bug** → the change actually worked but vision graded it false (e.g.
  a below-fold element the screenshot missed). Propose a fix to
  `lib/vision/verify-page.ts`. **Highest priority — a lying verifier poisons this
  whole loop.**
- **prompt-gap** → propose a skill / instruction refinement (diff).

### 4. Write the report (human-gated)
Write `docs/dreams/YYYY-MM-DD-dream.md`: the metric, each cluster (label, count,
root-cause class, exemplars), and the concrete proposed diff/ticket. Surface the
diffs for approval (a PR, or `spawn_task` per proposal). **Apply nothing.**

### 5. Measure
Append one line to `docs/dreams/self-reflection-log.md`: `date · total · passRate ·
Δ vs prior day · #clusters · #proposals · #approved-since-last`. This is the loop's
own scorecard — if passRate isn't trending up as proposals get approved, the loop
isn't working and needs re-think, not more runs.

## Scheduling
Run daily via a Claude Code routine: `/schedule` a once-a-day job whose prompt is
"Run /dream". Late local time, after the day's traffic. Manual `/dream` any time to
reflect on demand. (A Vercel cron can't do this — the clustering/synthesis needs the
agent harness.)

## Scope
v1 = the **copilot builder surface** (`surface='copilot'` in
`agent_reflection_events`). Extending the same table + loop to **deployed customer
agents** (self-improving Brain v2) is the higher-leverage product follow-up —
deliberately deferred so v1 stays small and honest.

## The self-referential proof
2026-07-07, by hand: `vision_check` caught SeldonChat's "Done ✅"-but-not-applied
lie → clustered → root-caused (slug='home' vs 'r1') → fixed → captured the lesson →
then caught the *inverse* (a below-fold false negative) → fixed the verifier.
`/dream` automates the detect→cluster→propose steps so the next such class surfaces
without a human noticing it in a screenshot first.
