# Outbound-UX Bundle (multi-agent-per-client) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes track steps.

**Goal:** Make the multi-agent-per-client model real in the UX, and let outbound (event) agents control *when* they send. From Max's live testing: (a) booking rules don't belong on a review agent; (b) "when does the review send — 1h/4h/24h after the job?" should be configurable; (c) deploying a 2nd agent to a client created a **duplicate** client — you should attach to an existing one; (d) a client's card should list all its agents.

**Built on:** the unified agent model (`blueprint.trigger`), the phone fix (`isOutboundDeployment`), and the existing **`/api/cron/outbound-scheduled-sends`** cron (seen live — reuse it for delayed sends).

**Conventions:** verify `pnpm -C packages/crm typecheck` (0 — RE-RUN yourself), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build`. Commit per task; push at the end. Work in `icp3-wedge`.

---

### F1: Hide booking rules for outbound agents; show send-timing instead
**Files:** `src/app/(dashboard)/studio/clients/*` (the card — `BOOKING RULES` panel) + the deployment list item (already carries `isOutbound` from the phone fix).
- [ ] On the Clients card, when `isOutbound` (event/schedule agent), HIDE the `BOOKING RULES` panel (duration/buffer/hours/required-fields — irrelevant; the agent never books) and render a small note + the **Send timing** control from F2 instead. Inbound agents keep booking rules unchanged. Verify (typecheck + check-use-server). Commit.

### F2: Configurable send delay for event agents (reuse the scheduled-sends cron)
**Files:** INVESTIGATE the scheduled-send infra first — grep `outbound-scheduled-sends`, `scheduled_sends`/`scheduledSends`, `api/cron/outbound-scheduled-sends`, how a delayed send is enqueued + processed. Then `agent-guardrails`/`agent-trigger` or the deployment for a `sendDelayMinutes` field; `run-event-agent.ts`.
- [ ] Add an optional **send delay** to the event agent: `blueprint.trigger` gains `delayMinutes?: number` (event kind only) OR a deployment-level `sendDelayMinutes` — pick whichever the scheduled-sends infra keys off; pin it. Choices surfaced in UI: **Immediately · 1h · 4h · 24h · 48h**.
- [ ] In `run-event-agent`: when `delayMinutes > 0`, **enqueue a scheduled send** (due = now + delay) via the existing scheduled-sends path INSTEAD of sending now; the cron composes+verifies+guardrails+sends at due time (reuse the same compose/verify/guardrail/memory pipeline — do NOT duplicate it; the cron should call the same send path). When `delayMinutes` is 0/absent → send immediately as today. Throttle/verify/guardrails still apply at actual send time.
- [ ] Tests (DI): a review agent with `delayMinutes:1440` on `booking.completed` → a scheduled send is enqueued (not sent now); `0` → sends now. If the cron path is complex, the minimal-safe version is: enqueue with the composed-or-recomposed payload + run the gates at fire time. Report the exact mechanism. Verify (tests + typecheck + check-use-server + build). Commit.

### F3: Deploy step 2 — attach to an EXISTING client (fixes duplicate clients)
**Files:** `src/app/(dashboard)/studio/agents/[id]/deploy/deploy-client.tsx` (step 2 "Client details") + the deploy action that creates the client/clientOrg (grep the deploy submit → `createDeployment`/client-org creation).
- [ ] INVESTIGATE how a client is created on deploy today (it always makes a new clientOrg → the duplicate ACME). Add to step 2 a **"Use an existing client"** selector: list the agency's existing clients (clientOrgs — grep `listClientOrgsForAgency`); selecting one **attaches** the new agent as a deployment on that SAME client (reusing its soul/business-details/number) instead of creating a new client. Keep "New client" as the other option (default). 
- [ ] The attach path must NOT re-provision a number (outbound shares it; inbound to an existing client with a held line should surface the existing number / reuse it). Verify. Commit.

### F4: Client card lists all the client's agents
**Files:** `src/app/(dashboard)/studio/clients/page.tsx` + the deployments query.
- [ ] Group deployments by client (clientOrg / client name) so ONE client card shows ALL its agents (e.g. "AI Phone Receptionist · Review Requester · Speed-to-lead") with each agent's status, instead of one card per deployment. Keep per-agent actions (pause/cancel) addressable. Verify (typecheck + check-use-server + build). Commit. **Push F1–F4.**

### F5: Guardrail/verify editor fields (tune per agent in the UI)
**Files:** `src/app/(dashboard)/studio/agents/[id]/editor-client.tsx` (the template editor).
- [ ] Add editor fields for **Guardrails** (enabled toggle, max/day, min-hours-between-per-contact, quiet-hours start/end) writing `blueprint.guardrails`, and **Quality checks (verify)** — at minimum a simple list of `must_include` / `max_length` rows writing `blueprint.verify` (or a "use smart defaults" toggle that leaves them unset → defaults apply). Keep it optional; blank = the live defaults. Persist via the existing blueprint save. Verify (typecheck + check-use-server + build). Commit. **Push F5.**

---

## Self-Review
- **Coverage:** booking-rules-hidden (F1) · send-delay via the existing cron (F2) · attach-to-existing-client = the duplicate fix (F3) · client-card-lists-agents (F4) · per-agent guardrail/verify editor (F5). ✓
- **Reuse, don't duplicate:** F2 MUST route through the existing scheduled-sends cron + the same compose/verify/guardrail/memory pipeline (no second send path). F3 reuses `listClientOrgsForAgency` + the clientOrg model.
- **Risk flags:** F2 (scheduling) + F3 (client-attach) are the meaty ones — investigate the existing infra first + do the minimal-safe wiring; F1/F4/F5 are UI over data that already exists (`isOutbound`, deployments, blueprint).
