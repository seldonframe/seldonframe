# Unified Agent Model — P1 (Trigger model + Review-requester + Speed-to-lead) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes track steps.

**Goal:** Generalize an agent from `surface: voice|chat` to **Trigger × Channel × Skill**, and ship two **event-triggered, outbound** agents — **Review-requester** (`booking.completed` → SMS/email) and **Speed-to-lead** (`lead.created` → SMS/email) — built on the existing `SeldonEvent` dispatch + the `/automations` send path.

**Architecture:** A pure `agent-trigger.ts` owns the `AgentTrigger` union + back-compat from `surface`. The two skills are pure message-composers. A dispatcher subscribes them to existing `SeldonEvent`s and sends via the existing outbound SMS/email seam. The builder gains a "What kind of agent?" step; the agents list shows a trigger chip.

**Spec:** `docs/superpowers/specs/2026-06-25-unified-agent-model-design.md`

**Conventions:** verify `pnpm -C packages/crm typecheck` (baseline 0 — RE-RUN yourself), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build` (REAL build). Commit per task; push at the end. Work in the `icp3-wedge` worktree.

---

### Task T1: `agent-trigger.ts` — the Trigger model (pure, TDD)
**Files:** Create `src/lib/agents/triggers/agent-trigger.ts` + `tests/unit/agents/triggers/agent-trigger.spec.ts`.
- [ ] Define:
  ```ts
  export type AgentTrigger =
    | { kind: "inbound"; channel: "voice" | "chat" | "email" | "sms" }
    | { kind: "event"; event: string; channel: "sms" | "email" }
    | { kind: "schedule"; cron: string; channel: "email" | "digest" };
  export function triggerFromSurface(surface: string | null | undefined): AgentTrigger; // surface→{inbound,channel}
  export function resolveAgentTrigger(stored: Partial<AgentTrigger> | null | undefined, surface?: string | null): AgentTrigger; // stored ?? from surface; validate/clamp bad shapes to a safe inbound default
  export function triggerLabel(t: AgentTrigger): string; // "Inbound · voice" | "After booking · SMS" | "Weekly · email" (for chips)
  export const KNOWN_EVENTS: { value: string; label: string }[]; // e.g. booking.completed, lead.created, invoice.paid
  ```
- [ ] Tests (TDD): `triggerFromSurface("voice")` → `{kind:"inbound",channel:"voice"}`; `resolveAgentTrigger(null,"chat")` → inbound chat; a stored `{kind:"event",event:"booking.completed",channel:"sms"}` resolves verbatim; a malformed stored value → safe inbound default; `triggerLabel` for each kind. Verify (test + typecheck + check-use-server). Commit.

### Task T2: Schema — `trigger` on the blueprint (additive)
**Files:** the agent blueprint type (`src/db/schema/agents.ts` `AgentBlueprint`) + its zod patch (`src/lib/agent-templates/schema.ts`). Likely NO migration (blueprint is jsonb).
- [ ] Add `trigger?: AgentTrigger` to `AgentBlueprint` (import the type). Extend the template blueprint patch schema (zod) to accept it (optional, validated to the union). Existing rows: `resolveAgentTrigger(blueprint.trigger, template.surface)` yields the inbound default → byte-for-byte today. typecheck 0. Commit. (If the blueprint isn't jsonb / needs a column, add an additive `trigger` jsonb column instead + a 00NN migration, journal pure-append.)

### Task T3: The two skills — pure message composers (TDD)
**Files:** Create `src/lib/agents/skills/review-requester.ts` + `speed-to-lead.ts` + specs.
- [ ] `composeReviewRequest({ contactName, businessName, reviewUrl, channel })` → `{ subject?, body }` — a short, on-brand ask for a Google review with the link; SMS vs email variants. `composeSpeedToLead({ contactName, businessName, channel, leadSummary })` → `{ subject?, body }` — instant acknowledgement + next step. Both pure, no I/O; reuse the per-deployment persona's `businessName`/voice where available (pass it in). 
- [ ] Tests: includes the review URL / lead ack; SMS body length-bounded; missing name → graceful generic. Verify. Commit.

### Task T4: Dispatch — subscribe the skills to existing events + outbound send
**Files:** find the `SeldonEvent` dispatch (grep `SeldonEvent`, `dispatch`, the ICP "Triggers webhook → SeldonEvent → dispatch") + the existing outbound SMS/email send used by `/automations` (grep `/automations`, `sendSms`, `sendEmail`, `speed`, `review`). 
- [ ] READ how `/automations` currently fires review-requester + speed-to-lead (the events + the send). Wire the new model: when a `booking.completed` / `lead.created` SeldonEvent fires for an org/deployment whose agent trigger matches, run the matching skill (T3) → send via the EXISTING outbound seam (reuse, don't reinvent). Throttle (review: one-per-contact). Keep the existing /automations behavior working (this generalizes, doesn't break). If `booking.completed`/`lead.created` aren't emitted yet, add the emit at the booking-created / lead-created site. DI the send + event lookup so it's unit-testable.
- [ ] Test (DI): a `booking.completed` event → `composeReviewRequest` called + send invoked once; a second event for the same contact → throttled (no second send); `lead.created` → speed-to-lead send. Verify (tests + typecheck + check-use-server + build). Commit.

### Task T5: Builder UX — "What kind of agent?" + the two starter templates
**Files:** the new-agent flow + STARTER_TEMPLATES (grep `STARTER_TEMPLATES`, `New agent`, the surface control `src/app/(dashboard)/studio/agents`).
- [ ] In the new-agent / template editor, replace the binary surface control with a **Trigger picker**: "Answers when… [Someone contacts the business (inbound) · Something happens (event → pick from `KNOWN_EVENTS`) · On a schedule]" then the **Channel** (filtered by trigger). Default = inbound (today's behavior). Persist `blueprint.trigger`. Add **Review-requester** + **Speed-to-lead** to `STARTER_TEMPLATES` (event triggers + the T3 skills as their playbook). Verify (typecheck + check-use-server + build). Commit.

### Task T6: Agents-list trigger chips
**Files:** the Agents tab list (`src/app/(dashboard)/studio/agents/*`).
- [ ] Render `triggerLabel(resolveAgentTrigger(...))` as a chip on each agent row ("📞 Inbound · voice", "⚡ After booking · SMS"). Verify (typecheck + check-use-server). Commit.

### Task T7: Verify + push
- [ ] `pnpm -C packages/crm typecheck` (report 0) · the new specs + agent/deployment suites pass · `check-use-server` clean · **`pnpm build` exit 0**. Push. Surface the manual smoke: create a Review-requester agent, mark a booking complete (or fire the event), confirm the outbound SMS/email goes out with the review link.

---

## Self-Review
- **Spec coverage (P1):** trigger model (T1,T2) · the two agents as pure skills + event wiring (T3,T4) · builder trigger step + starters (T5) · agents-list chips (T6) · verify (T7). Scheduled agents (P2), email-responder (P3), full /automations fold-in (P4) are out. ✓
- **Type consistency:** `AgentTrigger`, `resolveAgentTrigger`, `triggerLabel`, `blueprint.trigger`, `composeReviewRequest`/`composeSpeedToLead`. ✓
- **Risk flag:** T4 depends on the existing `SeldonEvent` + `/automations` send — the implementer MUST read those first + reuse, not reinvent; if events aren't emitted, add the emit at the source.
