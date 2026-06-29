# Marketplace Buyer Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Work in `C:\Users\maxim\CascadeProjects\Seldon Frame\.claude\worktrees\icp3-wedge\packages\crm`. Verify each phase: `node --import tsx --test`, `npx tsc --noEmit -p tsconfig.json` (0 errors), `bash scripts/check-use-server.sh src`, `pnpm build` (exit 0). Commit per task; the build/typecheck gate before each push.

**Goal:** A dedicated, world-class post-purchase journey for the marketplace BUYER — buy an agent → a generated setup wizard → a focused "My Agent" home — reusing the deployment model, never touching the agency app.

**Architecture:** A pure **generic engine** (`buildOnboardingSteps(blueprint)`) turns any agent's blueprint into an ordered step list. Each step writes existing per-deployment config (customization / booking policy / calendar binding / phone). The buyer's purchase yields a **buyer-owned deployment**; the wizard configures it; go-live activates it; the "My Agent" home reads it. UI ports the Claude Design output (`C:\Users\maxim\Downloads\sf-onboarding-flow\SeldonFrame Onboarding.dc.html`) into React, with the **real `SeldonFrameMark` logo** + brand **teal-green `#00897B`** accent (NOT Claude Design's violet).

**Tech Stack:** Next.js 16 / React 19, Drizzle + Neon (additive jsonb), `node --import tsx --test`, server actions, the deployment model + per-deployment customization + Composio + the #139 billing rail.

**Spec:** `docs/superpowers/specs/2026-06-29-marketplace-buyer-onboarding-design.md` (b70898e5).

---

## File structure

**New (pure logic + types):**
- `src/lib/marketplace/onboarding/steps.ts` — `OnboardingStepKind`, `OnboardingStep`, `buildOnboardingSteps(blueprint)` (pure). The engine.
- `src/lib/marketplace/onboarding/progress.ts` — `OnboardingProgress` type + `nextIncompleteStep` / `markStepDone` (pure).
- `tests/unit/marketplace/onboarding/steps.spec.ts`, `progress.spec.ts`.

**New (buyer↔deployment seam):**
- `src/lib/marketplace/buyer/buyer-deployment.ts` — `resolveOrCreateBuyerDeployment({ buyerOrgId, listing })` + `getBuyerAgent(deploymentId, buyerOrgId)` (org-scoped read for the home).
- `tests/unit/marketplace/buyer/buyer-deployment.spec.ts`.

**New (routes — buyer surface, NOT the agency app):**
- `src/app/(buyer)/layout.tsx` — focused buyer shell (real `SeldonFrameMark`, minimal nav, teal accent; no agency nav).
- `src/app/(buyer)/agent/[deploymentId]/setup/page.tsx` + `setup-wizard-client.tsx` — the wizard.
- `src/app/(buyer)/agent/[deploymentId]/page.tsx` + `my-agent-client.tsx` — the My Agent home.
- `src/components/buyer/` — ported step components + the shell, brand-themed.
- `src/app/(buyer)/agent/actions.ts` — `"use server"` buyer actions (thin wrappers over existing deployment actions + a setup-progress writer).

**Modified:**
- `src/lib/marketplace/billing/webhook-apply.ts` (or the install path) — on activation, ensure the buyer deployment exists + redirect target.
- `src/lib/marketplace/actions.ts` — `installAgentListingAction` returns the buyer-setup redirect for the buyer path.
- `proxy.ts` — buyers landing on `/clients/new` or the agency dashboard redirect to their `/agent/[id]`.
- `src/lib/agents/voice/...` (P5) — resolve the builder/template AI key for a deployment's voice path (fail-soft to platform).

---

## P0 — The generic engine + buyer→deployment seam

### Task 1: The OnboardingStep model + `buildOnboardingSteps`

**Files:** Create `src/lib/marketplace/onboarding/steps.ts`; Test `tests/unit/marketplace/onboarding/steps.spec.ts`.

**INVESTIGATE first:** the agent template `blueprint` shape (`src/db/schema/agents.ts` / `AgentBlueprint`) — confirm where `surface` (voice/chat/sms/email), the bound `connectors`/tools (Composio toolkits, e.g. `googlecalendar`, social toolkits), and the config fields live. Map real blueprint fields to the step inputs below.

- [ ] **Step 1: Write the failing test** — the receptionist (voice + googlecalendar) and the poster (social toolkits, no voice) produce the right ordered step kinds.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOnboardingSteps } from "../../../../src/lib/marketplace/onboarding/steps";

test("receptionist: business → calendar → phone → test → go-live", () => {
  const steps = buildOnboardingSteps({
    surface: ["voice", "sms"],
    connectors: [{ kind: "composio", toolkit: "googlecalendar" }],
  });
  assert.deepEqual(steps.map((s) => s.kind), [
    "business_info", "connect_tool", "phone", "test", "go_live",
  ]);
  assert.equal(steps[1].toolkit, "googlecalendar");
});

test("social poster: brand → connect socials → test → go-live (NO phone)", () => {
  const steps = buildOnboardingSteps({
    surface: ["social"],
    connectors: [{ kind: "composio", toolkit: "instagram" }, { kind: "composio", toolkit: "linkedin" }],
  });
  const kinds = steps.map((s) => s.kind);
  assert.ok(kinds.includes("brand_info"));
  assert.ok(kinds.includes("connect_tool"));
  assert.ok(!kinds.includes("phone"));
  assert.equal(kinds.at(-1), "go_live");
});

test("a connector-less chat agent: business → test → go-live", () => {
  const steps = buildOnboardingSteps({ surface: ["chat"], connectors: [] });
  assert.deepEqual(steps.map((s) => s.kind), ["business_info", "test", "go_live"]);
});
```

- [ ] **Step 2: Run it — fails** (`buildOnboardingSteps` not defined).
- [ ] **Step 3: Implement** `buildOnboardingSteps(blueprint)`:

```ts
export type OnboardingStepKind =
  | "business_info" | "brand_info" | "connect_tool" | "phone"
  | "cadence" | "preview" | "test" | "go_live";

export type OnboardingStep = {
  kind: OnboardingStepKind;
  label: string;
  required: boolean;
  toolkit?: string;       // for connect_tool
};

type Blueprint = {
  surface: string[];                                   // voice | chat | sms | email | social
  connectors?: { kind: string; toolkit?: string }[];
};

const VOICE = (s: string[]) => s.includes("voice");
const SOCIAL = (s: string[]) => s.includes("social");

export function buildOnboardingSteps(bp: Blueprint): OnboardingStep[] {
  const steps: OnboardingStep[] = [];
  steps.push(SOCIAL(bp.surface)
    ? { kind: "brand_info", label: "About your brand", required: true }
    : { kind: "business_info", label: "About your business", required: true });
  for (const c of bp.connectors ?? []) {
    if (c.toolkit) steps.push({ kind: "connect_tool", label: `Connect ${c.toolkit}`, required: false, toolkit: c.toolkit });
  }
  if (VOICE(bp.surface)) steps.push({ kind: "phone", label: "Your phone", required: true });
  if (SOCIAL(bp.surface)) steps.push({ kind: "cadence", label: "Posting cadence", required: false });
  steps.push({ kind: SOCIAL(bp.surface) ? "preview" : "test", label: SOCIAL(bp.surface) ? "Preview a post" : "Hear it work", required: false });
  steps.push({ kind: "go_live", label: "Go live", required: true });
  return steps;
}
```

- [ ] **Step 4: Run — passes.** **Step 5: Commit** `feat(buyer): generic onboarding-step engine`.

### Task 2: Onboarding progress (resumable)

**Files:** Create `src/lib/marketplace/onboarding/progress.ts`; Test `progress.spec.ts`.

- [ ] TDD `OnboardingProgress = { doneKinds: OnboardingStepKind[] }` + `markStepDone(progress, kind)` (idempotent dedup) + `firstIncompleteStep(steps, progress)` (returns the first step whose kind ∉ doneKinds, or null when all done). Tests: marking dedups; first-incomplete skips done; all-done → null. Commit `feat(buyer): resumable onboarding progress`.

### Task 3: Buyer→deployment seam

**Files:** Create `src/lib/marketplace/buyer/buyer-deployment.ts`; Test `buyer-deployment.spec.ts`.

**INVESTIGATE:** the deployments store (`src/lib/deployments/...`) — how a deployment is created + its fields (`customization`, `booking_policy`, `calendar_ref`, phone, `status`, the source template id / blueprint, the owning org). Today `installAgentListingAction` clones a TEMPLATE into the buyer org — decide the minimal change so a buyer purchase yields a **deployment** of the listing's blueprint owned by the buyer org (reuse the existing deployment-create; the buyer org is the owner; status starts `setup`).

- [ ] TDD a PURE `planBuyerDeployment({ buyerOrgId, listing })` → the deployment-create input (sourced from `listing.agentBlueprint`, owner = buyerOrgId, status `setup`, `onboarding_progress` empty). Then the DI'd `resolveOrCreateBuyerDeployment` (idempotent: one deployment per buyer+listing) + `getBuyerAgent(deploymentId, buyerOrgId)` (org-scoped; returns the deployment + its blueprint + computed steps + progress). Tests with a fake store. Commit `feat(buyer): buyer-owned deployment on purchase`.

### Task 4: Wire deployment creation into the purchase + redirect

**Files:** Modify `src/lib/marketplace/actions.ts` (`installAgentListingAction`) + `src/lib/marketplace/billing/webhook-apply.ts`.

- [ ] On a **paid** purchase activating (webhook `active`) OR a **free** install, call `resolveOrCreateBuyerDeployment` and make the install action / success path return the buyer-setup target `/agent/<deploymentId>/setup`. Keep money-safety + idempotency. Update the `?purchased=true` success state (from `70e884f7`) to link "**Set up your agent →**" to that path. TDD the redirect-target resolution; verify build. Commit `feat(buyer): route purchase → buyer setup wizard`.

---

## P1 — Wizard shell + business-info + go-live (the minimum to a live agent)

### Task 5: Buyer shell + real logo + brand theme

**Files:** Create `src/app/(buyer)/layout.tsx`, `src/components/buyer/buyer-shell.tsx`, `src/components/buyer/theme.ts`.

- [ ] The focused buyer shell: the **real `SeldonFrameMark`** (`@/components/marketplace/marketplace-chrome`) + "SeldonFrame" wordmark, minimal nav, **`--accent: #00897B`** (the marketplace `MKT.green`), cream paper bg. Port the chrome from the `.dc.html` header but swap the violet token → teal + the text logo → `SeldonFrameMark`. Mobile-first. No agency nav. Commit `feat(buyer): focused buyer shell w/ real brand`.

### Task 6: Wizard route + step renderer

**Files:** Create `src/app/(buyer)/agent/[deploymentId]/setup/page.tsx` + `setup-wizard-client.tsx` + `src/app/(buyer)/agent/actions.ts`.

- [ ] Server page: `getBuyerAgent(deploymentId, getOrgId())` → 404/redirect if not the buyer's; compute `buildOnboardingSteps` + `firstIncompleteStep`; pass to the client wizard. Client: a progress indicator + one-step-per-screen renderer keyed by `step.kind`, a "Finish later" exit to `/agent/[id]`. Port the wizard frame from the `.dc.html` (progress, the step card), teal accent. Save after each step (resumable) via the buyer actions. Commit `feat(buyer): setup wizard shell + step router`.

### Task 7: business_info + go_live steps

**Files:** `src/components/buyer/steps/business-info-step.tsx`, `go-live-step.tsx`; wire `setDeploymentCustomizationAction` + `setBookingPolicyAction` (existing) via the buyer actions.

- [ ] Port the Claude Design "About your business" screen (name, services+prices, hours; the optional "paste your website" accelerator can be a P2 follow-up — ship the manual form first) → writes `deployment.customization.businessInfo` + services + `booking_policy.hours`. Port "Ready to go live" → "You're live ✨" → routes to `/agent/[id]`; go-live flips the deployment to `active` (gated only on true blockers). TDD the pure validation + the action wiring; verify build. Commit `feat(buyer): business-info + go-live steps`.

---

## P2 — Connect-calendar (Composio) + phone (BYO/provision)

### Task 8: connect_tool step (Composio)

**Files:** `src/components/buyer/steps/connect-tool-step.tsx`; reuse the existing per-deployment Composio connect (`calendar_ref` binding, `src/lib/agents/booking/`).

- [ ] Port "Connect Google Calendar" (one button + the why-line + connected success state) → the existing Composio OAuth connect for the deployment entity, writing `deployment.calendar_ref`. Generic over the toolkit (the step's `toolkit` drives the label/provider). Skippable (booking fail-softs to native). Verify. Commit `feat(buyer): connect-tool step (Composio)`.

### Task 9: phone step (BYO / provision)

**Files:** `src/components/buyer/steps/phone-step.tsx`; reuse the deployment number-provisioning action.

- [ ] Port the two-card "Forward my existing number" vs "Get a new number" → BYO writes the forward target; provision calls the existing Twilio number action + SIP wiring. Required for voice agents (go-live gated on a number present). Verify. Commit `feat(buyer): phone step (BYO/provision)`.

---

## P3 — Hear-it-work test step

### Task 10: test / preview step

**Files:** `src/components/buyer/steps/test-step.tsx` (voice) + `preview-step.tsx` (social).

- [ ] Voice: port "Call your receptionist right now" — show the test-line number, run against the deployment in `status:test` (money-safe, no live connectors fired beyond the test); copy "*This is your real agent on a test line.*" Social: a sample-post preview. Reuse the existing test-conversation path. Verify. Commit `feat(buyer): hear-it-work test step`.

---

## P4 — The "My Agent" home

### Task 11: My Agent home (status · activity · reconfigure · billing)

**Files:** Create `src/app/(buyer)/agent/[deploymentId]/page.tsx` + `my-agent-client.tsx`.

- [ ] Port the `.dc.html` "MY AGENT HOME": agent header + status chip + number/channels; this-week stats (mono numbers); the recent-activity feed (calls/bookings/messages with outcome badges — read the deployment's conversations/bookings, org-scoped); Configure cards that re-open a wizard step; Billing (plan + next bill + "Manage billing" → the existing buyer billing-portal action). Real logo + teal. Mobile-first. Verify. Commit `feat(buyer): My Agent home`.

---

## P5 — AI-key routing + agency-surface guard

### Task 12: builder/template AI key for the deployment voice path

**Files:** Modify the voice deployment path (`src/lib/agents/voice/...`) + the runtime key resolver.

- [ ] **INVESTIGATE:** how the deployment voice path currently resolves the OpenAI key (memory: platform key). Resolve the **builder/template** key first (the builder sets it in Studio per the spec's Decision 5), fail-soft to platform. For chat agents, resolve the builder's Anthropic key. If the builder set no key → surface "this agent isn't ready yet" to the buyer + flag the builder. TDD the resolver; verify. Commit `feat(buyer): builder-key routing for bought agents`.

### Task 13: redirect buyers away from agency surfaces

**Files:** Modify `proxy.ts` (or a layout guard).

- [ ] A buyer (an org that owns a buyer deployment but isn't an agency) landing on `/clients/new` or the agency dashboard is redirected to their `/agent/[id]`. Keep agency operators unaffected (detect by ownership/role). Verify. Commit `feat(buyer): keep buyers on their agent surface`.

### Task 14: Full verify + push

- [ ] Full marketplace + buyer suites green · tsc 0 · check-use-server clean · `pnpm build` exit 0 · push. Manual smoke (surface to Max, don't self-run live): buy a $1 agent → land on the setup wizard → business info → connect calendar → phone → hear it work → go live → My Agent home shows it live.

---

## Self-Review

- **Spec coverage:** persona/account (Task 5,11) · both phone options (Task 9) · pay-first→configure (Task 4 redirect) · generic engine (Task 1) · no buyer AI-key step / builder sets it (Task 12) · the journey + wizard + home (P1–P4) · reuse deployment/customization/Composio/billing (throughout) · edge cases resumable/skippable/builder-key-missing (Task 2, 7, 12). ✓
- **Decomposition:** P0 (pure + seam) is independently testable; each UI phase ships a working slice. The receptionist is live after P2; the home after P4.
- **Open items deferred to implementer INVESTIGATE (existing-code grounding, not placeholders):** the exact blueprint field names (Task 1), the deployment-create signature + buyer-ownership shape (Task 3), the voice key resolver (Task 12). Each task names the file to read.
- **No fabricated ratings / money risk:** go-live is the only state change in the buyer flow; the test step is `status:test`; billing already happened (P-pre).
