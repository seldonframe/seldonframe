# Phase 7.a — Live probe run report

**Generated:** 2026-04-21T20:42:09.228Z
**Model:** claude-opus-4-7
**Budget:** $5.00 cap
**Spent:** $0.7614 across 11 call(s)
**Wall-clock:** 179336ms

## Verdict

**needs prompt engineering**

Hallucination rate is 0% and grounding rate is 100%, but the vague-prompt adversarial probe produced a spec without asking clarifying questions. Ship 7.d's clarifying-questions loop before the synthesis engine goes into general availability.

## Classification summary

- Produced specs: **8 / 11**
- Grounded declines (cited real missing catalog/registry): **3 / 11**
- Ungrounded declines (no catalog evidence in refusal text): **0 / 11**
- Hallucinated specs (unknown tools / unknown events / uninstalled-block tools): **0 / 11**
- **Grounding rate:** 100% (threshold: ≥80%)
- **Hallucination rate:** 0.0% (threshold: =0%)
- Vague prompt produced a spec without clarifying questions: **yes (UX failure — 7.d clarifying-questions loop required)**

## Per-probe results

| Probe | Class | Validity | In tok | Out tok | Cost | Latency | Issues |
|---|---|---|---|---|---|---|---|
| 01-happy-path | produced_spec | PASS | 8112 | 1846 | $0.0867 | 24843ms | _none_ |
| 02-adversarial-hallucinatedBlock | declined_grounded | declined | 8053 | 87 | $0.0424 | 5722ms | `[model_declined] $` — Slack notifications are not available — no Slack MCP tool or block is installed in this workspace. Options: (1) send the lead alert to your team via email or SMS instead, or (2) install a Slack/webhook integration before wiring this automation. |
| 03-adversarial-vague | produced_spec | PASS | 8032 | 1659 | $0.0816 | 22527ms | _none_ |
| 04-adversarial-impossibleCapability | declined_grounded | declined | 8043 | 35 | $0.0411 | 2248ms | `[model_declined] $` — No MCP tool or installed block supports shipping physical mail via FedEx. |
| 05-adversarial-ambiguousRoute | produced_spec | PASS | 8051 | 367 | $0.0494 | 6039ms | _none_ |
| 06-determinism-run-1 | produced_spec | PASS | 8112 | 1529 | $0.0788 | 20683ms | _none_ |
| 06-determinism-run-2 | produced_spec | PASS | 8112 | 1742 | $0.0841 | 24276ms | _none_ |
| 06-determinism-run-3 | produced_spec | PASS | 8112 | 1908 | $0.0883 | 24565ms | _none_ |
| 06-determinism-run-4 | produced_spec | PASS | 8112 | 1791 | $0.0853 | 22394ms | _none_ |
| 06-determinism-run-5 | produced_spec | PASS | 8112 | 1571 | $0.0798 | 21325ms | _none_ |
| 07-novel-yoga-recovery | declined_grounded | declined | 8063 | 139 | $0.0438 | 4676ms | `[model_declined] $` — Request targets a yoga studio membership-recovery flow, but this workspace is a dental clinic with no membership/attendance data source — there is no event in the installed blocks' produces list (crm, caldiy-booking, formbricks-intake, sms, email) that signals 'member hasn't attended in 60 days', and no tool to query attendance. Cannot build a correct trigger without fabricating an event. |

## Determinism across 5 happy-path runs

- Identical hash matches to run 1: **1 / 5**
- Structurally equivalent to run 1: **2 / 5**
- Materially different from run 1: **3 / 5**
- Unique hashes: 5, unique skeletons: 4

### Skeleton fingerprints

- run 1: `trigger=form.submitted|count=5|wait|conv:sms|tool:create_booking|tool:send_email|end`
- run 2: `trigger=form.submitted|count=5|wait|conv:sms|tool:create_booking|tool:send_email|end`
- run 3: `trigger=form.submitted|count=7|wait|conv:sms|tool:update_contact|tool:create_booking|tool:send_sms|tool:send_email|end`
- run 4: `trigger=form.submitted|count=7|wait|conv:sms|tool:create_booking|tool:update_contact|tool:send_email|tool:send_sms|end`
- run 5: `trigger=form.submitted|count=4|wait|conv:sms|tool:create_booking|tool:send_email`

## Novel prompt (yoga-studio recovery)

Prompt: _"Build me an agent that helps a yoga studio recover members who haven't attended in 60 days, with a discount offer on their third reminder."_

Claude declined. Reason: "Request targets a yoga studio membership-recovery flow, but this workspace is a dental clinic with no membership/attendance data source — there is no event in the installed blocks' produces list (crm, caldiy-booking, formbricks-intake, sms, email) that signals 'member hasn't attended in 60 days', and no tool to query attendance. Cannot build a correct trigger without fabricating an event."

## Raw artifacts

- `live-run-raw.json` — machine-readable record
- `live-<probe>.raw.txt` — raw Claude text response
- `live-<probe>.thinking.txt` — adaptive thinking blocks (when present)
- `live-<probe>.json` — parsed AgentSpec (when JSON parse succeeded)
- `live-<probe>.prompt.txt` — exact prompt sent
