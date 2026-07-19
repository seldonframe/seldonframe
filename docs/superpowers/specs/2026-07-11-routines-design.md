# Bet 3 — Routines: natural-language scheduled agents

**Date:** 2026-07-11 · **Status:** spec (Max approved 2026-07-11; FIRST bet to build after lifecycle slice merges) · **Flag:** `SF_ROUTINES` strict-"1" · **Strategy:** docs/strategy/2026-07-11-hermes-agent-inspiration.md

## 0. What this is

The operator types *"every Friday at 4pm, text customers with unpaid invoices a friendly reminder"* → SF parses it, reads the parsed schedule BACK in plain words, and on confirm creates a scheduled agent that just runs. Hermes ships cron as first-class UX; SF's schedule rail (15-min cron dispatcher) and agent-generation pipeline already exist — this is a thin surface over two live rails.

## 1. Seams (verified in prior recon this session)

| Seam | Location | Fact |
|---|---|---|
| Schedule trigger | `lib/agents/validator.ts:121` `ScheduleTriggerSchema` (cron 5-field POSIX + IANA tz + catchup/concurrency) | Validated trigger shape exists. |
| Dispatcher | `lib/agents/triggers/schedule-agents.ts` `runDueScheduledAgents` + `app/api/cron/schedule-agents/route.ts` (15-min Vercel cron) | Deployments with `trigger.kind==="schedule"` fire via synthetic `schedule.fired` event, `lastFiredAt` idempotency. NO new rail. |
| NL → agent | `lib/agents/generate/**` (parse-intent → agent-bundle → bind-tools) + `generate_agent` MCP tool | The one-sentence→agent pipeline exists; routines reuse it with trigger forced to schedule. |
| Self-deploy | `deployToSelfAction` (lifecycle slice Wave 2, T11) | Deploy-into-own-workspace rail this feature rides. |
| Surface | `/automations` (starter-pack home per memory) | Routines list/create lives here, not a new nav item. |

## 2. Design

### Create
- `/automations` gains a **"New routine"** card (flag-gated): ONE text field + a Create button.
- Server: `parseRoutineAction(text)` — one LLM call (DI, Zod-gated) → `{cron, timezone (default workspace tz), instruction, channel?, toolkits?}`. Parse reuses/extends `parse-intent`; cron validated by the existing cron utility; unparseable time → `{ok:false, reason}` with examples, never a guessed schedule.
- **Read-back gate (never-lies):** confirm screen renders the parsed schedule in PLAIN WORDS ("Every Friday at 4:00 PM, America/New_York") + what it will do + which tools it needs (Composio connect status inline, reusing the lifecycle Connected-stage component). Operator confirms → `createRoutineAction` builds the agent via the generate pipeline (trigger FORCED to the parsed schedule) and deploys to self via `deployToSelfAction`. No confirm, no create.
- After the lifecycle slice: routine agents get the same Agent Home ladder (supervised run before first fire is offered, not required).

### Manage
- Routines list on `/automations`: plain-words schedule, last fired (`lastFiredAt`), next fire (computed), pause/resume (deployment active toggle — existing), delete. A routine IS an agent deployment — the list filters deployments with `trigger.kind==="schedule"` + `metadata.routine=true` stamp; no new tables.

### Guardrails
- Routines that message customers inherit default guardrails (quiet hours, daily caps — `defaultGuardrailsForSkill`), stated on the confirm screen.
- First-fire safety: the confirm screen offers "Run it once now, supervised" (lifecycle supervised-run) before the schedule arms; arming without a test is allowed but the card shows "never test-run" honestly.

## 3. Guards
- Optimistic-path: parse failure → explicit error + examples; cron validated before any write; confirm screen is the ONLY path to create.
- Org-scope: routines are deployments in the operator's own org; list queries org-scoped.
- No new trigger rail, no new tables (one metadata stamp), no per-routine cron entries (the 15-min dispatcher covers all).

## 4. Build phases
1. **P1:** parse action + confirm/read-back + create via generate+self-deploy + list/pause/delete on /automations.
2. **P2:** supervised-first-fire integration + guardrail surfacing polish + routine templates ("common routines" starter chips).

Estimate: P1 ≈ 700–1,000 LOC incl. tests (UI composition + one parse module; L-17 0.94x band + parse cross-ref tests).

## 5. KPIs
Routines created/week · % confirmed on first parse (parse quality) · % test-run before arming · routine retention (still active after 30 days).

## 6. Non-goals
Event-triggered routines beyond schedule (the message/event trigger rails have their own roadmap) · routine marketplace listings (later — they're agents, so the rail exists) · sub-15-minute schedules (dispatcher cadence is the floor).
