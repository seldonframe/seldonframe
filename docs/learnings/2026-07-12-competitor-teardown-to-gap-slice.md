# Competitor teardown → gap slice: verify what already exists before building the "missing" feature

## The problem, in one line

"Build what Serif/Fyxer/Deck have" looked like a two-subsystem build (inbox-watch
trigger + voice learning) — but nobody had checked what the platform already
shipped, and the first recon pass ran against a **stale `origin/main`**.

## The approach

1. **Teardown before touching code:** fetch the competitors' own pages and force
   each product into the same primitive loop (watch → classify → compose → act on
   a trust ladder → escalate). Three funded products collapsed into one config of
   the existing agent model — which turned "clone a product" into "diff two
   primitive lists."
2. **Diff against the platform, not against memory:** parallel read-only scouts
   mapped the four seams (trigger union, Composio, /record compiler, Brain).
   Their reports CONTRADICTED session memory (record-to-agent "not on main").
3. **`git fetch` before trusting any origin/main claim.** The remote ref was
   days stale; fresh main already had the inferred inbox-watch trigger
   (`inferTriggerFromModel`, packages/crm/src/lib/recordings/compile-agent.ts),
   widened Gmail triage defaults, the lifecycle trust ladder, and a
   Composio→archetype push bridge. ~80% of the assumed build already existed.
4. **Spec only the verified gaps** (voice ingestion; push delivery to
   record-compiled deployments), each anchored to file:line refs read directly
   from the fresh base commit — never from scout paraphrase (L-16).
5. **Route the review at money-path severity:** the push path multiplies LLM
   spend by inbound-email volume. The independent reviewer was explicitly
   pointed at throttle/dedupe/failure-marking, and found all three real gaps
   (uncapped runs, TOCTOU dedupe, failed-runs-marked-done).

## Judgment calls

- **Did NOT add a new trigger kind** to the `AgentTrigger` union — `trigger.event`
  already accepts arbitrary strings, so `composio.gmail.new_message` rides the
  existing `kind:"event"` rail. A new union branch would have been Wrong
  Abstraction on first occurrence.
- **Did NOT build Composio webhook infra** — it existed; the slice only added a
  second dispatch population (deployments) beside archetypes, additive and
  soft-fail.
- **Did NOT store sent emails** — only a distilled ≤40-line style profile goes to
  Brain (privacy floor), samples truncated before leaving the ingestion function.
- **Kept the hourly poll as the floor:** push is an at-deploy, fail-soft UPGRADE;
  every failure path degrades back to the recording's inferred schedule rather
  than leaving the agent trigger-less.
- **Accepted a 2x LOC overrun without stopping:** it was capability (tests for
  the atomic claim mechanism), not horizontal infrastructure — the L-17
  addendum distinction.

## The reusable rule, one line

Before speccing a "missing" capability, `git fetch` and read the seams on the
FRESH base commit — session memory and scout reports describe the repo as it
was, and building against a stale main re-implements shipped work.

(Appended to `tasks/lessons.md` as L-35.)
