# Review-Agent UX (per-client setup, first-principles) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Make the review-request agent (and every outbound event agent) set-up-in-2-minutes, GHL-style. Root cause of the confusion: **client-specific data (the review link) lives on the shared template.** Fix: move it to the deployment (per-client), surface it where you deploy/manage the client, and let you edit any agent from the client card. (Decisions: review link = **paste per-client now**, GMB-via-Composio deferred — not in SF's catalog + Google reviews API is restricted. Responder + "many more agent types" = the L4 generator's job, not hand-built here.)

**Conventions:** `pnpm -C packages/crm typecheck` (0 — gate), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build`. Commit per task; push at the end. Work in `icp3-wedge`.

---

### R1: Per-client review link (off the template, onto the deployment)
**Files:** `src/lib/agents/persona/deployment-customization.ts` (`DeploymentCustomization` already holds per-client overrides — add `reviewUrl?`) + `src/lib/deployments/store.ts` (the `DeploymentPatch`/list already carry `customization`) + `run-event-agent-deps.ts` (resolve the per-deployment review URL).
- [ ] Add `reviewUrl?: string` to `DeploymentCustomization` (+ the zod). In `buildRunEventAgentDeps` / `run-event-agent`, resolve the review URL as `deployment.customization?.reviewUrl ?? template blueprint.reviewUrl` so each client uses THEIR link; the template's becomes a fallback/default. (The verify rubric + `composeReviewRequest` already take a `reviewUrl` — feed the resolved one.)
- [ ] Tests: a deployment with its own `customization.reviewUrl` → the review SMS uses it (not the template's); none → template fallback; neither → the existing "no review link → skip/verify-block" behavior. Verify. Commit.

### R2: Surface the review link in the deploy flow + client card
**Files:** `src/app/(dashboard)/studio/agents/[id]/deploy/deploy-client.tsx` (step 2 "Client details") + `src/app/(dashboard)/studio/clients/page.tsx` (the outbound-agent note from F1) + the customization editor (`deployment-customization-editor.tsx`).
- [ ] In deploy step 2, when the agent is a **review-requester** (skill/trigger event=booking.completed), show a **"Google review link"** field (with a hint: "paste the client's Google review URL — find it in their Google Business Profile → Ask for reviews"). Persist onto the new deployment's `customization.reviewUrl` via the deploy action.
- [ ] On the client card, for a review agent, show the review link inline with an **edit** affordance (it's the one thing that must be set for the agent to fire). A muted warning when it's unset ("⚠ No review link — this agent won't send until you add the client's Google review URL"). Verify. Commit.

### R3: Edit any agent from the client card (not just pause/delete)
**Files:** `src/app/(dashboard)/studio/clients/page.tsx` (each agent row).
- [ ] Add a **"Configure"** action per agent row → opens its per-deployment settings (the existing `DeploymentCustomizationEditor` + booking/guardrail where relevant), OR links to the template editor `(/studio/agents/[id])` for template-level config. Decide: client-specific tweaks (greeting/voice/review-link/send-timing/business-info) → the deployment customization editor inline; template-level (the skill/prompt) → a link to the agent editor. Keep pause/cancel. Verify (typecheck + check-use-server + build). Commit. **Push R1–R3.**

### R4: Deploy defaults to "attach to existing client" when a name matches
**Files:** `deploy-client.tsx` (the F3 New/Existing toggle) + the page that builds the attachable-clients list.
- [ ] Make the existing-client path **prominent + the default** when attachable clients exist: pre-select "Existing client" (or auto-match by typed name) so deploying another agent to "ACME PLUMBING" attaches to the existing org instead of silently creating a 3rd. Keep "New client" one click away. (Bug seen live: a 3rd ACME was created because the new-client form was the default.) Verify. Commit. **Push R4.**

---

## Strategic note (not built here): "any agent via natural language"
The responder + "many more agent types" come from **enriching the L4 generate-by-default engine**, not hand-building each: (a) more **triggers** (e.g. `review.received`, `invoice.paid`), (b) more **tools** per agent (Composio toolkits — incl. a future **GMB toolkit** for read-reviews/auto-reply, gated on Composio+Google opening the reviews API), (c) more **skills**. The review-RESPONDER is the canonical first test of this once a GMB read-reviews tool exists. Track as a separate generator-enrichment effort.

## Self-Review
- **Root cause fixed:** review link moves template→deployment (R1), surfaced where you set up the client (R2), every agent editable from the card (R3), no duplicate clients (R4). ✓
- **Reuse:** `DeploymentCustomization` (already the per-client override store) + the F3 attach path + the F1/F4 client card. ✓
