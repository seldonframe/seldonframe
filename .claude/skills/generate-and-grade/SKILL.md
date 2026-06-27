---
name: generate-and-grade
description: Run the agent-generator regression net. Use after ANY change under packages/crm/src/lib/agents/generate/** (parse-intent, agent-bundle, bind-tools, tool-catalog) to catch generator breakages — misclassification, lost/wrong tool bindings, wrong channel, wrong skill template — before a human does.
---

# generate-and-grade

A deterministic regression net for the agent generator. It runs a fixed prompt
set through the generator's **no-LLM** path — `assembleAgentBundle(heuristicIntent(sentence))`
— and asserts each sentence still yields a SANE agent (right trigger kind, expected
tool bindings, expected channel, correct skill template). No live LLM key needed;
it is reproducible in CI and locally.

## When to use

After ANY change to:
- `packages/crm/src/lib/agents/generate/**` (parse-intent.ts, agent-bundle.ts,
  bind-tools.ts, tool-catalog.ts)
- the trigger model (`src/lib/agents/triggers/agent-trigger.ts`)
- the starter templates (`src/lib/agent-templates/starter-pack.ts`)

## Run it

From `packages/crm`:

```
node --import tsx --test tests/regression/generator-prompts.spec.ts
```

Expect: **all cases pass** (`fail 0`). The baseline is green; any red is a regression.

## On failure — STOP and report

If any case fails, the generator regressed. Do NOT proceed with the change. Read
the failure message — it names the exact sentence and every mismatch on its own
line, e.g.:

```
Generator regression for sentence: "Post a weekly Instagram highlight of our 5-star reviews"
  • trigger.kind: expected "schedule", got "event"
  • connectors: missing required tool id(s) [postiz] — bound: [none]
  • skill: customSkillMd contains forbidden signature(s) ["You are the review-requester"] — wrong skill template was used
```

Report to the user: the sentence + which axis broke (trigger / tool / channel /
skill template), and STOP. Fix the generator so the case passes again.

## Only re-calibrate if the heuristic genuinely improved

The expectations in `tests/regression/generator-prompts.ts` are the locked
baseline of what the deterministic heuristic emits today (including documented
`KNOWN GAP:` cases where it underperforms the LLM author). Only edit an
expectation when you have deliberately made the heuristic SMARTER and the new
output is the better answer — never loosen an expectation just to make a red
case green against unchanged code.
