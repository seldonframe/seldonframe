# Phase 7.a — Live probe run report

**Generated:** 2026-04-21T20:20:29.072Z
**Model:** claude-opus-4-7
**Budget:** $5.00 cap
**Spent:** $0.7233 across 11 call(s)
**Wall-clock:** 176988ms

## Verdict

**fundamentally unreliable for archetypal prompts**

The happy-path Speed-to-Lead synthesis did not produce a valid AgentSpec. Synthesis cannot ship until this round-trip works; prompt engineering alone is unlikely to close the gap without investigating the validator failures first.

## Per-probe results

| Probe | Validity | In tok | Out tok | Cost | Latency | Issues |
|---|---|---|---|---|---|---|
| 01-happy-path | declined | 8032 | 580 | $0.0547 | 11331ms | `[model_declined] $` — Cannot auto-book the patient into a consultation slot — the MCP catalog has no create_booking tool (only appointment-type CRUD). I can text them, have a conversation, and email a confirmation, but assigning them to a specific slot requires either a create_booking tool or sending them the /book/<slug> link so they self-schedule. Want me to generate that variant instead? |
| 02-adversarial-hallucinatedBlock | declined | 7973 | 56 | $0.0413 | 2644ms | `[model_declined] $` — Slack integration is not available — no Slack block is installed and no MCP tool exists to post to Slack. Available notification channels are email and sms only. |
| 03-adversarial-vague | PASS | 7952 | 1345 | $0.0734 | 19761ms | _none_ |
| 04-adversarial-impossibleCapability | declined | 7963 | 50 | $0.0411 | 2349ms | `[model_declined] $` — No FedEx or physical mail/shipping tool is available in the MCP catalog; cannot send a physical welcome kit. |
| 05-adversarial-ambiguousRoute | PASS | 7971 | 362 | $0.0489 | 6342ms | _none_ |
| 06-determinism-run-1 | PASS | 8032 | 1881 | $0.0872 | 27849ms | _none_ |
| 06-determinism-run-2 | PASS | 8032 | 2210 | $0.0954 | 30099ms | _none_ |
| 06-determinism-run-3 | declined | 8032 | 499 | $0.0526 | 9316ms | `[model_declined] $` — No MCP tool exists to create a booking for a contact — the catalog only exposes list/create/update_appointment_type (templates), not a way to schedule an actual appointment on a contact's behalf. The best we can do is text them a booking link so they self-book; if that's acceptable, reissue the request and I'll build it. |
| 06-determinism-run-4 | PASS | 8032 | 2198 | $0.0951 | 31016ms | _none_ |
| 06-determinism-run-5 | PASS | 8032 | 1983 | $0.0897 | 30004ms | _none_ |
| 07-novel-yoga-recovery | declined | 7983 | 161 | $0.0439 | 6239ms | `[model_declined] $` — This workspace is a dental clinic with no attendance/class-visit tracking, no membership system, and no event for 'member inactive for 60 days'. The available block events only cover contacts, deals, bookings, forms, email, sms, payments, and landing pages — none emit a 60-day-inactivity trigger, and there is no scheduled/cron trigger type in the AgentSpec schema (only event triggers). Cannot build this agent with the installed blocks and available tools. |

## Determinism across 5 happy-path runs

- Identical hash matches to run 1: **1 / 5**
- Structurally equivalent to run 1: **2 / 5**
- Materially different from run 1: **3 / 5**
- Unique hashes: 5, unique skeletons: 4

### Skeleton fingerprints

- run 1: `trigger=form.submitted|count=4|wait|conv:sms|tool:send_email|end`
- run 2: `trigger=form.submitted|count=7|wait|tool:send_sms|conv:sms|tool:update_contact|tool:send_email|tool:create_deal|end`
- run 3: `__error__`
- run 4: `trigger=form.submitted|count=6|wait|conv:sms|tool:update_contact|tool:send_sms|tool:send_email|end`
- run 5: `trigger=form.submitted|count=4|wait|conv:sms|tool:send_email|end`

## Novel prompt (yoga-studio recovery)

Prompt: _"Build me an agent that helps a yoga studio recover members who haven't attended in 60 days, with a discount offer on their third reminder."_

Claude declined. Reason: "This workspace is a dental clinic with no attendance/class-visit tracking, no membership system, and no event for 'member inactive for 60 days'. The available block events only cover contacts, deals, bookings, forms, email, sms, payments, and landing pages — none emit a 60-day-inactivity trigger, and there is no scheduled/cron trigger type in the AgentSpec schema (only event triggers). Cannot build this agent with the installed blocks and available tools."

## Raw artifacts

- `live-run-raw.json` — machine-readable record
- `live-<probe>.raw.txt` — raw Claude text response
- `live-<probe>.thinking.txt` — adaptive thinking blocks (when present)
- `live-<probe>.json` — parsed AgentSpec (when JSON parse succeeded)
- `live-<probe>.prompt.txt` — exact prompt sent
