# Agent Operate Mode — the day-2 surface (logs · pause · what it did today)

**Date:** 2026-07-12 · **Status:** spec (from Max's day-2 question 2026-07-11 night) · **Sequencing:** after hotfix → setup-mode → read-back reconciliation · **Flag:** rides `SF_AGENT_LIFECYCLE` (third mode of the agent page)

## 0. First principles

The ladder answers "is it real?" (Setup mode). Operate mode answers the two questions an owner of a WORKING agent asks forever after: **"what did it do?"** and **"can I stop it right now?"** Day-2 needs, ranked: (1) kill switch always visible, (2) today's activity with evidence, (3) the needs-you queue (escalations/approvals), (4) health + cost at a glance, (5) keep teaching it. Everything else is settings.

## 1. Existing rails (the data layer is DONE — this slice is surface only)

| Need | Rail that exists today |
|---|---|
| Logs | `agentTurns` (toolCalls/toolResults jsonb per turn), conversations, `supervised_runs.action_log`, `replay_conversation` / `tail_agent_conversations` backing libs |
| Pause | deployment `active` toggle (stops schedule fires + routing) |
| Kill | `blueprint.guardrails.enabled` (blocks outbound actions) — evaluateGuardrails is pure/deterministic |
| Health | EvalRun store (pass rate), validator pass rate 24h + conversations 24h (get_workspace_state already computes) |
| Cost | usage meter rollups (per-sub-account rail, 2026-07-08) |
| Teach | continue-interview action (Learned stage) |
| Escalations | escalate_to_human capability + inbox rails |

## 2. The mode

Page mode resolution becomes three-way: **incomplete → Setup wizard · complete+undeployed → compact home · deployed → Operate mode.**

Operate layout (top to bottom):
1. **Status bar (always visible, sticky):** `● Live` / `⏸ Paused` big toggle (deployment.active) + overflow "Stop all actions" (guardrails kill switch, confirm dialog, distinct from pause: paused = won't trigger; killed = triggers but can't act — show both states honestly, never conflate). Next scheduled fire in plain words when schedule-triggered.
2. **Needs you (only when non-empty):** escalations + (later) approval-gated actions; count badge; each row links into the conversation.
3. **Today (the activity feed):** reverse-chron conversations + runs, each row = trigger source · one-line outcome · evidence chips (N actions, ✓ verified count once read-back lands). Drill-in = the SAME evidence lanes as the Run stage (PLAN/ACTIONS/WORDS — reuse, don't fork) over the stored turn data; replay via existing rail. Day grouping; "quiet day" empty state.
4. **Health strip:** eval pass % · validator pass 24h · conversations 7d · spend this period (usage meter). Each links to its detail.
5. **Teach box:** the Learned-stage interview input, inline ("Seldon, next time…"), same recompile-on-apply contract.
6. Ladder collapses to a one-line "Setup ✓ — view" link (audit trail, not navigation).

## 3. Guards
- Pause/kill both write EXISTING fields via org-guarded actions; UI state derives from a read-back of the row, never optimistic-only (the toggle reflects what IS).
- Feed reads org-scoped, paginated (50/day cap + "load more"); tool args/results rendered through the SAME summarize/no-secrets lens as supervised runs.
- No new tables. No new triggers. Surface-only slice + 2 thin actions (pause, kill).

## 4. Build shape (after read-back merges)
T1 mode resolution + status bar + pause/kill actions (TDD the derive + the two actions). T2 activity feed (query + row composition + drill-in reusing evidence lanes). T3 needs-you + health strip (existing computations surfaced). T4 teach box inline. Vision-verify pass. Estimate ≈ 900–1,300 LOC incl. tests (composition-dominant, 0.94x band).

## 5. Non-goals (v1)
Approval-gated actions mid-run (own slice; pairs with read-back v2) · cross-agent operations dashboard (agency roll-up = later) · notification channels config (rides existing notify rails) · editing schedule/trigger here (that's the editor's job, linked).
