# Unified Agent Model — Design

**Date:** 2026-06-25
**Status:** Approved (design) — Max chose "unify into one builder" + first agents = Review-requester & Speed-to-lead
**Author:** brainstormed with Max

## Problem

The agent builder (`/studio/agents`) only models **inbound voice / web-chat receptionists** — its only knob is `surface: voice | chat`. But agents are far broader: a Google-review requester (fires *after a job*, outbound SMS/email), an email responder (inbound *email*), a weekly "second-brain" recap (fires on a *schedule*, emails the operator). Today those live in a **separate** world (`/automations` + the `SeldonEvent` trigger system), disconnected from the builder + the marketplace. So a builder can't "create one agent and sell it" unless it's a phone receptionist.

## First Principle — an agent = **Trigger × Skill × Channel**

Three independent axes, collapsed into one ("surface") today:

| Axis | Today | Should be |
|---|---|---|
| **Trigger** (when it runs) | inbound only | **inbound** (call/chat/email arrives) · **scheduled** (cron) · **event** (booking.completed, lead.created, invoice.paid…) |
| **Skill** (what it does) | receptionist | receptionist · review-requester · speed-to-lead · email-responder · brain-recap · nurture… |
| **Channel** (how it speaks) | voice / web chat | + **SMS** · **email** · **internal digest** (to the operator) · inbound **or** outbound |

`surface: voice|chat` becomes ONE point in this space (trigger=inbound, channel=voice|chat). Everything in `/automations` is just other points — so **unify**: one builder creates any agent; the marketplace sells any agent.

## Build on what already exists

- **`SeldonEvent` dispatch** (the triggers→webhook→dispatch system, ICP Phase 4) already emits domain events. The new "event" trigger subscribes an agent to an event type.
- **`/automations`** already runs review-requester, speed-to-lead, missed-call text-back as bespoke automations. These become **agent templates** with an event trigger + outbound channel — same behavior, now first-class agents.
- **`agent_templates`** already has `blueprint` (skill/prompt/voice/connectors) + `surface`. Generalize `surface` → a `trigger` + `channels` config; keep `surface:voice|chat` as the inbound default for back-compat.

## Data model (additive)

`agent_templates.blueprint` (or a new `agent_templates.trigger` jsonb) gains:
```ts
trigger:
  | { kind: "inbound"; channel: "voice" | "chat" | "email" | "sms" }     // a call/msg arrives
  | { kind: "event"; event: string; channel: "sms" | "email" }            // e.g. "booking.completed"
  | { kind: "schedule"; cron: string; channel: "email" | "digest" }       // e.g. weekly Mon 8am
```
`agentType` already exists on listings; reuse it as the skill kind. Existing rows default to `{ kind:"inbound", channel: surface }`. No destructive migration.

## The builder UX (one flow)

Replace the binary "Surface: voice/chat" with a **3-step "What kind of agent?"**:
1. **Trigger** — "Answers when…": *Someone contacts the business* (inbound) · *Something happens* (event — pick booking-done / new-lead / invoice-paid…) · *On a schedule* (pick cadence).
2. **Channel** — voice / SMS / email / web chat / internal digest (filtered by what the trigger allows).
3. **Skill** — the prompt/playbook (existing editor), starting from a template matching the choice.

The agents list shows the trigger as a chip ("📞 Inbound · voice", "⚡ After booking · SMS", "🗓 Weekly · email") so the variety is legible.

## First two agents (event-triggered, outbound)

1. **Review requester** — trigger `event: booking.completed` (or a manual "job done" mark) → outbound SMS/email asking for a Google review (link to the client's GBP review URL). Throttle one-per-contact.
2. **Speed-to-lead** — trigger `event: lead.created` (form submit / missed call) → instant outbound SMS/email within seconds, then hand to the receptionist thread.

Both run on the existing per-deployment persona + the client's connected channels (Twilio/Resend). They reuse the deployment customization (greeting/voice/business-info) where relevant.

## Marketplace

Listings already carry `agentType`; surface the trigger/channel on the storefront so buyers see "Review Requester (after-booking SMS)" etc. No model change — just richer listing metadata + filters.

## Phasing

- **P1 — the model + the two agents:** generalize `trigger` on the template + the resolver; the builder's "What kind of agent?" step (inbound default unchanged); wire **Review-requester** (`booking.completed`) + **Speed-to-lead** (`lead.created`) to the existing `SeldonEvent` dispatch with outbound SMS/email; agents-list trigger chips. *After P1: a builder creates + sells an outbound, event-triggered agent — the model is proven beyond receptionists.*
- **P2 — scheduled agents:** the `schedule` trigger + a cron runner; the **weekly brain-recap** (emails the operator a recap + todo list).
- **P3 — inbound email agent:** `inbound + email` channel (the email-responder).
- **P4 — fold `/automations` fully into the builder + marketplace** (the existing automations become listed agent templates; retire the split).

## Post-P1 — Complete the loop (State · Verify · Guardrails/Stop), generated by default

P1 ships the **Trigger** primitive. But the convergent best-practice frame (OpenAI's 6-stage agent guide; Cherny/Karpathy/Steinberger on "loop engineering"; Mira; the Kimi swarm) says a *production* agent is a **loop**, not a prompt:

> **Trigger → (Model + Instructions + Tools + State) → Verify → Iterate**, bounded by a **Stop condition**, improved by **Evals**, kept honest by **Observability + Guardrails**.

Two non-negotiables from every source: **the checker must be separate from the maker** (a model grading its own work is "too generous a grader"), and **the loop must have brakes** (or it "bills you in silence" — the Ralph Wiggum loop). SeldonFrame already owns most of the pieces in scattered form — Composio (tools), `/runs` + RunContext + `get_agent_metrics` (observability), `run_agent_evals` (evals), Soul + Brain v2 (state), the receptionist's deterministic guardrails. The post-P1 work makes three of them **first-class primitives on every agent, generated by default from the one-English-sentence build**, so an agent is a complete, safe, self-improving loop — not just trigger×skill×channel:

1. **State (build FIRST — `docs/superpowers/plans/2026-06-25-agent-loop-memory-state.md`)** — wire **Soul + Brain v2 + RunContext** as agent **loop-memory** so an agent remembers across runs ("what I did, what failed, what's next"):
   - **Soul** = grounding read-context (business identity/services — already consumed at runtime).
   - **Brain v2** = the durable per-agent, per-subject memory store — the agent **recalls** relevant notes before acting and **records** what it did after. This generalizes the review throttle: "already asked this contact" becomes one recall against memory, not a bespoke tag probe.
   - **RunContext** = the per-run snapshot (already persisted to `/runs`) — extend it to carry the recalled/recorded memory so a run resumes instead of starting cold.
2. **Verify (maker ≠ checker)** — a separate, strict **checker** gates an agent's output before it's sent/saved. Maker = the client's agent (cheap/fast); checker = a strict pass (a rubric + `run_agent_evals`, optionally a stronger model on higher effort). Promotes evals from a dashboard number to the **in-loop gate**.
3. **Guardrails / Stop** — promote the receptionist's deterministic guardrails (quote-guard, enforced read-back, throttle) into a **per-agent configurable** layer, plus default **brakes** (max-iterations / token-budget / no-progress) on any looping or scheduled agent so it can't run all night for nothing.

**The one-sentence build, completed:** *"text every customer for a Google review the day after their job — never twice, only if the job was completed"* → SF emits trigger (event) + skill + channel + **guardrail** (never-twice = throttle) + **precondition** (job completed) + **checker** (link + name present, length-bounded) + **state** (recall: contacted before? → record: sent + outcome) + **stop** (1 per contact). Error-proofing is generated *with* the agent, not bolted on. This maps onto SeldonFrame's own six agent-builder primitives (Surface · Skill · Tools · Knowledge/Brain · Guardrails · Voice) plus the loop's Trigger/Verify/State/Stop.

**Phasing of the loop-completion work:** **L1 = State** (loop-memory — building now). **L2 = Verify** (maker≠checker gate + evals-in-loop). **L3 = Guardrails/Stop** (per-agent guardrail layer + budget/iteration brakes). **L4 = generate-by-default** (the one-sentence build emits all of the above).

## Non-goals (YAGNI now)

- A general no-code workflow builder (multi-step branching) — these are single-trigger→single-action agents for now.
- Arbitrary third-party event sources — start with SeldonFrame's own `SeldonEvent` types.

## Assumptions to validate during planning

- The exact `SeldonEvent` types emitted today (is `booking.completed` / `lead.created` already dispatched, or do we add them?).
- Whether to store `trigger` on `blueprint` vs a new column.
- The outbound-send seam (reuse the existing SMS/email send used by `/automations`).

## Related
- Per-deployment customization spec `2026-06-25-per-deployment-agent-customization-design.md` (the persona each of these agents speaks with).
- `/automations` starter pack + the `SeldonEvent` trigger dispatch (ICP Phase 4).
