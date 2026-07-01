# Self-Serve Agent Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deploying an agent to a real channel an agent-native verb — detect what a human must connect (calendar OAuth, Twilio), hand back the one Wizard link, else provision the number + go live — plus fix the bug where a connected calendar is ignored, plus make BYO-Twilio a paste-two-keys step.

**Architecture:** Reuse, don't reinvent. Requirement detection composes the *existing* buyer onboarding engine (`buildOnboardingSteps`/`goLiveBlockers`) + telephony-need (`deploymentNeedsNumber`) + connector-connectedness (`computeToolConnectionStatuses`). The deploy verb is a thin route over the existing buyer deploy seams; the CLI/MCP tool wrap the route. The auto-trunk adds one idempotent Twilio-Trunking method.

**Tech Stack:** Next.js 16 / React 19 route handlers, Drizzle+Neon, `node --import tsx --test`, the zero-dep `@seldonframe/cli`, the `skills/mcp-server` tool registry.

## Global Constraints
- **Money-safe by construction:** BYO Twilio + BYOK — NO new SF charge path, no COGS, no metering. The builder pays Twilio/LLM directly.
- **Flag-gated** behind a deploy feature gate (`SF_DEPLOY_ENABLED`, read via `process.env`; NOT the billing flag) and **inert without the builder's own creds** (no Twilio creds → telephony requirement simply reports unmet; nothing provisioned).
- **Idempotent:** re-deploy resumes (never duplicate deployments); trunk/number provisioning idempotent; release-on-cancel already exists.
- **No migration** — `deployments.bookingMode` already exists (`db/schema/deployments.ts:110`, default `"native"`, type `BookingMode = "native"|"external_link"|"api_mcp"|"cal_com"`).
- **Worktree:** `.claude/worktrees/icp3-wedge` on branch `feature/chatgpt-app-submission` (current with main). All paths below are relative to `packages/crm/` unless prefixed `packages/cli/` or `skills/`.
- **Copy leads with *earn*, never "build faster"** (positioning).
- **Republishing `@seldonframe/mcp`** (after editing `skills/mcp-server/src/tools.js`) is Max's action — the tool lands in-repo, goes live on his publish.
- Per-task commits. Verify each phase: `node --import tsx --test <new specs>`, `npx tsc --noEmit`, `pnpm check:use-server`, `pnpm build` (crm); `npm test` + `npm run build` (cli).

---

## Phase A — Booking fix (the real bug)

### Task A1: `calendarConnectPatch` (pure, TDD)

**Files:**
- Create: `src/lib/deployments/calendar-connect-patch.ts`
- Test: `tests/unit/deployments/calendar-connect-patch.spec.ts`

**Interfaces:**
- Consumes: `BookingMode` from `@/lib/deployments/booking-providers`.
- Produces: `calendarConnectPatch(input: { currentBookingMode: string | null | undefined; toolkit: string }): { bookingMode?: BookingMode }`.

- [ ] **Step 1: Write the failing test** — `tests/unit/deployments/calendar-connect-patch.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { calendarConnectPatch } from "../../../src/lib/deployments/calendar-connect-patch";

describe("calendarConnectPatch", () => {
  test("native + googlecalendar → flips to api_mcp", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "native", toolkit: "googlecalendar" }), { bookingMode: "api_mcp" });
  });
  test("unset/null + outlook → flips to api_mcp", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: null, toolkit: "outlook" }), { bookingMode: "api_mcp" });
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: undefined, toolkit: "googlecalendar" }), { bookingMode: "api_mcp" });
  });
  test("already api_mcp / cal_com → no change (idempotent, no downgrade)", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "api_mcp", toolkit: "googlecalendar" }), {});
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "cal_com", toolkit: "googlecalendar" }), {});
  });
  test("explicit external_link → left untouched (operator chose a handoff)", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "external_link", toolkit: "googlecalendar" }), {});
  });
  test("non-calendar toolkit → never touches bookingMode", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "native", toolkit: "gmail" }), {});
  });
});
```

- [ ] **Step 2: Run test — verify it FAILS** (module not found):
`cd packages/crm && node --import tsx --test tests/unit/deployments/calendar-connect-patch.spec.ts`

- [ ] **Step 3: Implement** — `src/lib/deployments/calendar-connect-patch.ts`:
```ts
// When a buyer connects a Google/Outlook calendar, the callback persists
// calendarRef — but bookingMode stays "native" (the default), so
// deploymentToBinding routes bookings to SF-native and the connected calendar
// is silently ignored. This pure helper computes the bookingMode part of the
// callback's patch: connecting a calendar flips native/unset → "api_mcp" so
// book_appointment reaches the connected calendar via Composio. Never downgrades
// an explicit external mode; never touches a non-calendar toolkit.

import type { BookingMode } from "@/lib/deployments/booking-providers";

const CALENDAR_TOOLKITS = new Set<string>(["googlecalendar", "outlook"]);

export function calendarConnectPatch(input: {
  currentBookingMode: string | null | undefined;
  toolkit: string;
}): { bookingMode?: BookingMode } {
  if (!CALENDAR_TOOLKITS.has(input.toolkit)) return {};
  const cur = input.currentBookingMode;
  // Already booking externally, or the operator chose an explicit handoff → leave it.
  if (cur === "api_mcp" || cur === "cal_com" || cur === "external_link") return {};
  // native / unset + a real calendar connection → route to the connected calendar.
  return { bookingMode: "api_mcp" };
}
```

- [ ] **Step 4: Run test — verify it PASSES.**

- [ ] **Step 5: Commit** — `git add src/lib/deployments/calendar-connect-patch.ts tests/unit/deployments/calendar-connect-patch.spec.ts && git commit -m "feat(deploy): calendarConnectPatch — connecting a calendar flips bookingMode to api_mcp (pure)"`

### Task A2: Wire `calendarConnectPatch` into the calendar callback

**Files:**
- Modify: `src/app/api/deployments/[id]/calendar/callback/route.ts` (the OAuth-return handler that persists `calendarRef` via `updateDeployment`)

**Interfaces:**
- Consumes: `calendarConnectPatch` (Task A1); the existing `updateDeployment(deploymentId, patch)` (from `@/lib/deployments/store`) and the resolved `{ toolkit, calendarRef }` already in the route.

- [ ] **Step 1: Read the route** to locate where it calls `updateDeployment(...)` with the verified `calendarRef` (research: `resolveCalendarRefFromCallback` builds the ref ~lines 68-99; the persist is ~lines 101-157). Note the current deployment's `bookingMode` is available on the loaded deployment (fetch it if the handler doesn't already load the row — it loads the deployment to guard ownership).

- [ ] **Step 2: Extend the persist patch.** At the `updateDeployment` call that writes `calendarRef`, merge the booking-mode flip:
```ts
import { calendarConnectPatch } from "@/lib/deployments/calendar-connect-patch";
// … inside the handler, where `deployment` is the loaded row, `toolkit` is the
// query param, and `calendarRef` is the verified ref:
await updateDeployment(deployment.id, {
  calendarRef,
  ...calendarConnectPatch({ currentBookingMode: deployment.bookingMode, toolkit }),
});
```
Do NOT change anything else in the route (verification, redirect, error handling stay).

- [ ] **Step 3: Typecheck** — `cd packages/crm && npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit** — `git add src/app/api/deployments/[id]/calendar/callback/route.ts && git commit -m "fix(deploy): flip bookingMode to api_mcp on calendar connect so bookings reach the connected calendar"`

> There is no unit test for A2 (a thin route wire over the A1-tested pure helper, mirroring how other callback routes are verified by tsc + the pure-helper test). The end-to-end effect is covered by the live smoke in the E2E runbook.

---

## Phase B — `computeDeployReadiness` (pure; the one net-new function)

### Task B1: `computeDeployReadiness` + types (pure, TDD)

**Files:**
- Create: `src/lib/deployments/deploy-readiness.ts`
- Test: `tests/unit/deployments/deploy-readiness.spec.ts`

**Interfaces:**
- Consumes: `OnboardingStep` (`@/lib/marketplace/onboarding/steps`), `ToolConnectionStatus` (`@/lib/agents/mcp/tool-connection`), `OnboardingProgress` (`@/lib/marketplace/onboarding/progress`), `goLiveBlockers` (`@/lib/marketplace/buyer/buyer-onboarding`).
- Produces: `computeDeployReadiness(input): DeployReadiness` and the exported types `DeployRequirement`, `DeployReadiness`. **Pure + sync** — the impure caller (Task C1) resolves `steps`/`toolStatuses`/`telephonyNeeded`/`telephonyConnected` and passes them in.

- [ ] **Step 1: Write the failing test** — `tests/unit/deployments/deploy-readiness.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computeDeployReadiness } from "../../../src/lib/deployments/deploy-readiness";
import type { OnboardingStep } from "../../../src/lib/marketplace/onboarding/steps";
import type { ToolConnectionStatus } from "../../../src/lib/agents/mcp/tool-connection";

const VOICE_STEPS: OnboardingStep[] = [
  { kind: "business_info", label: "About your business", required: true },
  { kind: "connect_tool", label: "Connect googlecalendar", required: false, toolkit: "googlecalendar" },
  { kind: "phone", label: "Your phone", required: true },
  { kind: "go_live", label: "Go live", required: true },
];
const CAL_UNCONNECTED: ToolConnectionStatus = { key: "googlecalendar", label: "Google Calendar", kind: "composio", connected: false };
const CAL_CONNECTED: ToolConnectionStatus = { key: "googlecalendar", label: "Google Calendar", kind: "composio", connected: true };

describe("computeDeployReadiness", () => {
  test("voice + unconnected calendar + no telephony → missing [calendar_oauth, telephony], not ready", () => {
    const r = computeDeployReadiness({
      steps: VOICE_STEPS, toolStatuses: [CAL_UNCONNECTED],
      telephonyNeeded: true, telephonyConnected: false,
      progress: { doneKinds: ["business_info"] }, wizardPath: "/agent/dep1/setup",
    });
    assert.equal(r.ready, false);
    assert.deepEqual(r.missing.map((m) => m.kind).sort(), ["calendar_oauth", "telephony"]);
    assert.equal(r.wizardPath, "/agent/dep1/setup");
  });
  test("voice + everything connected → ready, no missing", () => {
    const r = computeDeployReadiness({
      steps: VOICE_STEPS, toolStatuses: [CAL_CONNECTED],
      telephonyNeeded: true, telephonyConnected: true,
      progress: { doneKinds: ["business_info"] }, wizardPath: "/agent/dep1/setup",
    });
    assert.equal(r.ready, true);
    assert.equal(r.missing.length, 0);
  });
  test("chat-only (no telephony, no connectors) with business info done → ready", () => {
    const r = computeDeployReadiness({
      steps: [{ kind: "business_info", label: "x", required: true }, { kind: "go_live", label: "Go live", required: true }],
      toolStatuses: [], telephonyNeeded: false, telephonyConnected: false,
      progress: { doneKinds: ["business_info"] }, wizardPath: "/agent/dep2/setup",
    });
    assert.equal(r.ready, true);
  });
  test("business info NOT done → business_info requirement unmet", () => {
    const r = computeDeployReadiness({
      steps: VOICE_STEPS, toolStatuses: [CAL_CONNECTED],
      telephonyNeeded: true, telephonyConnected: true,
      progress: { doneKinds: [] }, wizardPath: "/agent/dep1/setup",
    });
    assert.equal(r.ready, false);
    assert.ok(r.missing.some((m) => m.kind === "business_info"));
  });
  test("tolerates empty/malformed input", () => {
    // @ts-expect-error — jsonb edge
    const r = computeDeployReadiness({ wizardPath: "/x" });
    assert.equal(r.ready, true); // nothing required found → ready
    assert.deepEqual(r.requirements, []);
  });
});
```

- [ ] **Step 2: Run test — verify it FAILS.**

- [ ] **Step 3: Implement** — `src/lib/deployments/deploy-readiness.ts`:
```ts
// The deploy verb's requirement detector. PURE + sync: the impure caller (the
// /api/v1/build/deploy route) resolves the four inputs and this merges them into
// one readiness object. Reuses the buyer onboarding engine's language so the IDE
// deploy verb and the web wizard agree on what "ready" means.
//
//   steps            = buildOnboardingSteps(normalizeBlueprintForOnboarding(type, blueprint))
//   toolStatuses     = computeToolConnectionStatuses(blueprint.connectors, isBindingConnectedForOrg(orgId, …))  [LIVE]
//   telephonyNeeded  = deploymentNeedsNumber(blueprint.trigger, surfaceForType(type))
//   telephonyConnected = the org has Twilio creds OR the deployment already has a number  [LIVE]
//   progress         = the deployment's onboarding progress (business_info etc.)

import type { OnboardingStep } from "@/lib/marketplace/onboarding/steps";
import type { ToolConnectionStatus } from "@/lib/agents/mcp/tool-connection";
import type { OnboardingProgress } from "@/lib/marketplace/onboarding/progress";
import { goLiveBlockers } from "@/lib/marketplace/buyer/buyer-onboarding";

export type DeployRequirement =
  | { kind: "calendar_oauth"; toolkit: string; met: boolean; label: string }
  | { kind: "other_connector"; toolkit: string; met: boolean; label: string }
  | { kind: "telephony"; met: boolean; label: string }
  | { kind: "business_info"; met: boolean; label: string };

export type DeployReadiness = {
  ready: boolean;
  requirements: DeployRequirement[];
  missing: DeployRequirement[];
  wizardPath: string;
};

const CALENDAR_TOOLKITS = new Set<string>(["googlecalendar", "outlook"]);

export function computeDeployReadiness(input: {
  steps?: OnboardingStep[];
  toolStatuses?: ToolConnectionStatus[];
  telephonyNeeded?: boolean;
  telephonyConnected?: boolean;
  progress?: OnboardingProgress | null;
  wizardPath: string;
}): DeployReadiness {
  const requirements: DeployRequirement[] = [];

  // 1. Required non-connector, non-phone steps (business_info / brand_info) —
  //    from the progress-based go-live blockers.
  const blockers = goLiveBlockers(input.steps ?? [], input.progress ?? null);
  const blockedKinds = new Set(blockers.map((b) => b.kind));
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (steps.some((s) => s.kind === "business_info" || s.kind === "brand_info")) {
    const met = !blockedKinds.has("business_info") && !blockedKinds.has("brand_info");
    requirements.push({ kind: "business_info", met, label: "Business info" });
  }

  // 2. Connectors — LIVE connectedness (a calendar toolkit vs any other).
  for (const s of input.toolStatuses ?? []) {
    if (CALENDAR_TOOLKITS.has(s.key)) {
      requirements.push({ kind: "calendar_oauth", toolkit: s.key, met: s.connected, label: s.label });
    } else {
      requirements.push({ kind: "other_connector", toolkit: s.key, met: s.connected, label: s.label });
    }
  }

  // 3. Telephony — only when the agent needs a phone line.
  if (input.telephonyNeeded) {
    requirements.push({ kind: "telephony", met: Boolean(input.telephonyConnected), label: "Phone number" });
  }

  const missing = requirements.filter((r) => !r.met);
  return { ready: missing.length === 0, requirements, missing, wizardPath: input.wizardPath };
}
```

- [ ] **Step 4: Run test — verify it PASSES.**

- [ ] **Step 5: Commit** — `git add src/lib/deployments/deploy-readiness.ts tests/unit/deployments/deploy-readiness.spec.ts && git commit -m "feat(deploy): computeDeployReadiness — pure merge of onboarding steps + telephony + connector-connectedness"`

---

## Phase C — The deploy verb (route + CLI + MCP tool + builder-block)

### Task C1: `POST /api/v1/build/deploy` route + the readiness resolver deps

**Files:**
- Create: `src/lib/deployments/deploy-readiness-deps.ts` (the impure resolver that feeds `computeDeployReadiness`)
- Create: `src/app/api/v1/build/deploy/route.ts`
- Test: `tests/unit/deployments/deploy-readiness-deps.spec.ts` (the pure surface-mapping bits only)

**Interfaces:**
- Consumes: `computeDeployReadiness`/`DeployReadiness` (B1); `guardApiRequest` (`@/lib/api/guard`); `resolveOrCreateBuyerDeployment` (`@/lib/marketplace/buyer/buyer-deployment`); `buyerSetupPath` (`@/lib/marketplace/buyer/buyer-routes`); `normalizeBlueprintForOnboarding`+`buildOnboardingSteps` (`@/lib/marketplace/onboarding/steps`); `computeToolConnectionStatuses` (`@/lib/agents/mcp/tool-connection`); `isBindingConnectedForOrg` (`@/lib/agents/mcp/binding-connection`); `deploymentNeedsNumber` (`@/lib/deployments/margin`); `surfaceForType` (`@/lib/agent-templates/store`); `resolveBuilderTelephony` (`@/lib/telephony/config`); `activateDeploymentAction`/`provisionDeploymentNumberAction` (`@/lib/deployments/actions`); `goLiveAction` (`@/app/(buyer)/agent/actions`); `getAgentTemplate` (`@/lib/agent-templates/store`); `getDeployment`/`createDeployment`/`updateDeployment` (`@/lib/deployments/store`).
- Produces: `resolveDeployReadiness(orgId, template, deployment): Promise<DeployReadiness>` and the route.

- [ ] **Step 1: Read the seams** you'll compose — `resolveOrCreateBuyerDeployment` (its input + return, `lib/marketplace/buyer/buyer-deployment.ts`), `buyerSetupPath` (`lib/marketplace/buyer/buyer-routes.ts`), `resolveBuilderTelephony` (`lib/telephony/config.ts` — returns `{ ok:true, … } | { ok:false, missing }`), `deploymentNeedsNumber` (`lib/deployments/margin.ts:180`), and the existing bearer route `src/app/api/v1/build/wallet/topup/route.ts` (the exact `guardApiRequest` pattern to mirror). For the self-built `templateId` idempotency, read how `resolveOrCreateBuyerDeployment` stamps `sourceListingId` and mirror it with a `(builderOrgId, agentTemplateId)` lookup: find an existing non-canceled `deployments` row for that template before `createDeployment`.

- [ ] **Step 2: Write `resolveDeployReadiness`** — `src/lib/deployments/deploy-readiness-deps.ts` (NOT `"use server"`; a plain async helper):
```ts
import { computeDeployReadiness, type DeployReadiness } from "@/lib/deployments/deploy-readiness";
import { normalizeBlueprintForOnboarding, buildOnboardingSteps } from "@/lib/marketplace/onboarding/steps";
import { computeToolConnectionStatuses } from "@/lib/agents/mcp/tool-connection";
import { isBindingConnectedForOrg } from "@/lib/agents/mcp/binding-connection";
import { deploymentNeedsNumber } from "@/lib/deployments/margin";
import { surfaceForType } from "@/lib/agent-templates/store";
import { resolveBuilderTelephony } from "@/lib/telephony/config";
import { buyerSetupPath } from "@/lib/marketplace/buyer/buyer-routes";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { AgentTemplateType } from "@/lib/agent-templates/store";
import type { Deployment } from "@/db/schema/deployments";

export async function resolveDeployReadiness(args: {
  orgId: string;
  templateType: AgentTemplateType | string;
  blueprint: AgentBlueprint;
  deployment: Pick<Deployment, "id" | "phoneNumber" | "customization">;
}): Promise<DeployReadiness> {
  const { orgId, templateType, blueprint, deployment } = args;

  const normalized = normalizeBlueprintForOnboarding(templateType, blueprint);
  const steps = buildOnboardingSteps(normalized);

  const toolStatuses = await computeToolConnectionStatuses(
    blueprint.connectors ?? [],
    (binding) => isBindingConnectedForOrg(orgId, binding),
  );

  const surface = surfaceForType(templateType as AgentTemplateType);
  const telephonyNeeded = deploymentNeedsNumber(blueprint.trigger, surface);
  // telephony is "connected enough" if a number is already attached OR the org
  // has BYO Twilio creds so the deploy verb can provision/forward one.
  const telephony = await resolveBuilderTelephony(orgId);
  const telephonyConnected = Boolean(deployment.phoneNumber) || telephony.ok === true;

  // progress lives on the deployment customization (onboardingProgress); tolerate absence.
  const progress = (deployment.customization as { onboardingProgress?: { doneKinds?: string[] } } | null)
    ?.onboardingProgress ?? null;

  return computeDeployReadiness({
    steps, toolStatuses, telephonyNeeded, telephonyConnected, progress,
    wizardPath: buyerSetupPath(deployment.id),
  });
}
```
> Confirm the exact `resolveBuilderTelephony` return shape + `deploymentNeedsNumber` arg order when you read them in Step 1; adjust the two lines above to match (the surrounding composition is stable).

- [ ] **Step 3: Write the route** — `src/app/api/v1/build/deploy/route.ts`:
```ts
// POST /api/v1/build/deploy — the deploy verb. Bearer-authed (wst_). Resolves/
// creates a buyer-owned deployment (idempotent), computes readiness, and either
// hands back the Wizard link for the human-only connect steps or provisions the
// number + goes live. Money-safe: BYO Twilio/BYOK, no charge path; flag-gated;
// inert without the builder's own creds (readiness simply reports unmet).
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { resolveDeployReadiness } from "@/lib/deployments/deploy-readiness-deps";
import { getAgentTemplate } from "@/lib/agent-templates/store";
import { resolveOrCreateBuyerDeployment } from "@/lib/marketplace/buyer/buyer-deployment";
// … plus the deployment-resolve + activate/provision/goLive imports per Step 1.

function deployEnabled(): boolean {
  return process.env.SF_DEPLOY_ENABLED === "1" || process.env.SF_DEPLOY_ENABLED === "true";
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  if (!deployEnabled()) return NextResponse.json({ ok: true, status: "disabled" });

  const body = (await request.json().catch(() => ({}))) as {
    source?: { templateId?: string; listingSlug?: string };
    phone?: { mode: "forward"; number: string } | { mode: "provision"; areaCode: string };
  };

  // 1. Resolve/create the buyer-owned deployment (idempotent). listingSlug →
  //    resolveOrCreateBuyerDeployment; templateId → resolve-or-create on
  //    (orgId, templateId). Load the template's type + blueprint.
  //    [compose per Step 1; on a bad/absent source → 400 invalid_source]

  // 2. Readiness.
  const readiness = await resolveDeployReadiness({ orgId, templateType, blueprint, deployment });
  if (!readiness.ready) {
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
    return NextResponse.json({
      ok: true, status: "needs_connect", deploymentId: deployment.id,
      requirements: readiness.requirements, missing: readiness.missing,
      wizardUrl: `${base}${readiness.wizardPath}`,
    });
  }

  // 3. Ready → apply phone (forward → activateDeploymentAction; provision →
  //    provisionDeploymentNumberAction) then goLiveAction. Return status:"live".
  //    [compose per Step 1; surface provisioning errors as { ok:false, reason }]
  return NextResponse.json({ ok: true, status: "live", deploymentId: deployment.id, phoneNumber });
}
```
Fill the `[compose per Step 1]` blocks with the real seam calls you read in Step 1. Keep the money-safety posture: no new Stripe/charge call anywhere; every provisioning call is the existing inert-without-creds one.

- [ ] **Step 4: Test the pure surface-mapping** (`deploy-readiness-deps.spec.ts` is optional if the file has no pure-only logic; the route itself is verified by tsc + the E2E runbook, mirroring `wallet/topup/route.ts` which ships without a unit test). At minimum: `cd packages/crm && npx tsc --noEmit` → 0 errors; `pnpm check:use-server` → passes.

- [ ] **Step 5: Commit** — `git add src/lib/deployments/deploy-readiness-deps.ts src/app/api/v1/build/deploy/route.ts && git commit -m "feat(deploy): POST /api/v1/build/deploy — needs_connect (wizard link) | live"`

### Task C2: `seldonframe deploy` CLI

**Files (all under `packages/cli/`):**
- Modify: `src/lib/api-client.ts` (add `DeployResult` type + `deploy(input)` method)
- Create: `src/commands/deploy.ts` (`runDeployCommand`)
- Modify: `src/cli.ts` (import + `case "deploy"`), `src/lib/help.ts` (the deploy line)
- Test: `tests/deploy.spec.ts` (NOTE the `.spec.ts` suffix — the `npm test` glob is `tests/**/*.spec.ts`)

**Interfaces:**
- Consumes: the route's response shape (mirror as the CLI's own `DeployResult`, like the payout CLI mirrors `PayoutResult`).
- Produces: `runDeployCommand(args, client, writer): Promise<number>`.

- [ ] **Step 1: Read** `packages/cli/src/commands/payout.ts` + `src/lib/api-client.ts`'s `payout()` — mirror them exactly (imports use `.js`; NodeNext ESM).

- [ ] **Step 2: Write the failing test** — `packages/cli/tests/deploy.spec.ts` (4 branches: `needs_connect` prints the wizardUrl + missing list; `live` prints "✓ deployed — <number>"; `disabled` prints an honest line; a fetch error → non-zero exit). Use a fake `fetchImpl` + a capture writer, exactly like `tests/payout.spec.ts`.

- [ ] **Step 3: Implement** `DeployResult` + `deploy()` on `ApiClient` (POST `/api/v1/build/deploy` with `{ source, phone }`, bearer header — mirror `payout()`), and `runDeployCommand` in `src/commands/deploy.ts`:
  - parse `--template <id>` | `--listing <slug>` → `source`; `--forward <e164>` (use `normalizeUsPhoneToE164`? no — the server normalizes; pass the raw string as `{mode:"forward",number}`) | `--area <code>` → `{mode:"provision",areaCode}`.
  - render `needs_connect` → "Connect these once, then re-run `seldonframe deploy`:\n" + each missing label + "\n→ " + wizardUrl (exit 0); `live` → "✓ deployed — <phoneNumber> is answering." (exit 0); `disabled` → writer.err honest line (exit 1); honor `--json`.
  - Wire `case "deploy"` in `cli.ts` + the help line in `help.ts` (place it beside `run`/`status`).

- [ ] **Step 4: Verify** — `cd packages/cli && node --import tsx --test tests/deploy.spec.ts` (4/4) + `npm run build` (tsc clean).

- [ ] **Step 5: Commit** — `git add packages/cli/src/lib/api-client.ts packages/cli/src/commands/deploy.ts packages/cli/src/cli.ts packages/cli/src/lib/help.ts packages/cli/tests/deploy.spec.ts && git commit -m "feat(cli): seldonframe deploy — deploy an agent, get the connect link or go live"`

### Task C3: `deploy_agent` MCP tool + builder-block `deploy_readiness` surface

**Files:**
- Modify: `skills/mcp-server/src/tools.js` (add the `deploy_agent` tool beside `publish_agent`)
- Modify: `src/app/api/v1/workspace-state/route.ts` (add per-agent `deploy_readiness` to the `builder` block, additive + fail-soft)

**Interfaces:**
- Consumes: `resolveDeployReadiness` (C1) for the builder-block; the route (C1) for the MCP tool.

- [ ] **Step 1: Read** `skills/mcp-server/src/tools.js` around `publish_agent` (`~:4753`) for the exact tool-definition shape (name/description/inputSchema/handler → `POST` to a build route), and the `builder` block assembly in `workspace-state/route.ts` (where the lifecycle/earnings fields are attached).

- [ ] **Step 2: Add the `deploy_agent` MCP tool** — mirrors `publish_agent`'s shape; input `{ workspace_id, source: {template_id|listing_slug}, phone? }`; handler POSTs `/api/v1/build/deploy`; **description** tells the agent: *when the result is `needs_connect`, relay the `wizardUrl` to the human ("open this once to connect your calendar / Twilio number"), then call `deploy_agent` again; when `live`, tell them the number is answering.* Lead the copy with *earn/deploy-to-sell*, not "build".

- [ ] **Step 3: Add `deploy_readiness` to the builder block** — for each agent in the block, compute `resolveDeployReadiness(...)` (fail-soft: wrap in try/catch, omit on error — matches the existing builder-block resilience). Additive; the operator-facing response is otherwise unchanged.

- [ ] **Step 4: Verify** — `cd packages/crm && npx tsc --noEmit` + `pnpm check:use-server` + `pnpm build`. (The MCP `tools.js` is plain JS — no tsc; a quick `node -e "require('./skills/mcp-server/src/tools.js')"` sanity-parse if a harness exists, else visual review against `publish_agent`.)

- [ ] **Step 5: Commit** — `git add skills/mcp-server/src/tools.js src/app/api/v1/workspace-state/route.ts && git commit -m "feat(deploy): deploy_agent MCP tool + builder-block deploy_readiness (republish @seldonframe/mcp = Max's action)"`

---

## Phase D — BYO-Twilio auto-trunk

### Task D0: LIVE-CHECK GATE (do before D1/D2)

- [ ] **Step 1:** Confirm the **OpenAI SIP origination URI** the current working platform trunk uses, and whether the OpenAI Realtime SIP gateway + `/api/v1/voice/openai/webhook` are **platform-level** (one shared SIP address any builder's trunk can point at) — read it off the existing working Twilio trunk / the OpenAI project config. Record the exact URI as the intended value of a new `OPENAI_SIP_ORIGINATION_URI` env (Max sets it in Vercel, like the other keys).
- [ ] **Step 2:** If the SIP gateway/webhook turns out to be **per-OpenAI-project** (each builder would need to configure their own OpenAI project SIP + webhook), STOP and escalate — Part D's scope changes materially; do not build D1/D2 until resolved. If platform-level (expected — it matches how voice works today), proceed.

### Task D1: `ensureBuilderTrunk` (idempotent, TDD with a fake client)

**Files:**
- Modify: `src/lib/telephony/twilio-client.ts` (add `ensureBuilderTrunk` to the `TwilioTelephonyClient` interface + the concrete impl)
- Test: `tests/unit/telephony/ensure-builder-trunk.spec.ts`

**Interfaces:**
- Produces: `TwilioTelephonyClient.ensureBuilderTrunk(input: { originationSipUri: string; friendlyName?: string }): Promise<{ trunkSid: string; created: boolean }>` — idempotent (reuse a trunk whose Origination URL already targets `originationSipUri`; else create one + set the URL).

- [ ] **Step 1: Write the failing test** — a fake `fetch` (or a fake client) exercising: (a) an existing trunk with a matching origination URL → returned, `created:false`, NO create POST; (b) no matching trunk → one `POST /Trunks` + one `POST /Trunks/{sid}/OriginationUrls`, returns the new sid + `created:true`. (Follow the interface-level fake pattern the `provisionVoiceNumber` tests use — inject a fake `TwilioTelephonyClient`, OR unit-test a pure `pickTrunkWithOrigination(trunks, uri)` helper + a thin fetch wrapper. Prefer extracting the pure matcher for the assertion.)

- [ ] **Step 2: Implement** on the concrete client (mirror the existing `attachNumberToTrunk` fetch+Basic-auth+form pattern; Trunking base `https://trunking.twilio.com/v1`):
  - `GET /v1/Trunks` → list trunks; for each candidate `GET /v1/Trunks/{sid}/OriginationUrls` and match `sip_url === originationSipUri` (extract a pure `pickTrunkWithOrigination(trunkOriginationPairs, uri)` for testability).
  - If found → `{ trunkSid, created: false }`.
  - Else `POST /v1/Trunks` (FriendlyName=`friendlyName ?? "SeldonFrame Voice"`) → sid; then `POST /v1/Trunks/{sid}/OriginationUrls` (`SipUrl=originationSipUri`, `Weight=10`, `Priority=10`, `Enabled=true`, `FriendlyName="SeldonFrame OpenAI gateway"`); return `{ trunkSid: sid, created: true }`.
  - Add the method to the `TwilioTelephonyClient` interface (optional `?` like `configureSmsUrl`, so existing fakes still satisfy the type).

- [ ] **Step 3: Run test — PASS.**

- [ ] **Step 4: Commit** — `git add src/lib/telephony/twilio-client.ts tests/unit/telephony/ensure-builder-trunk.spec.ts && git commit -m "feat(telephony): ensureBuilderTrunk — idempotently create/reuse the builder's Elastic SIP trunk → OpenAI gateway"`

### Task D2: Wizard connect-Twilio step (paste SID + token → auto-trunk → store creds)

**Files:**
- Create: `src/lib/telephony/connect-builder-twilio.ts` (`"use server"` action `connectBuilderTwilioAction`)
- Modify: `src/lib/telephony/config.ts` (ensure the stored `integrations.twilio.{accountSid, authToken, voiceTrunkSid}` shape `resolveBuilderTelephony` reads is what the action writes — reuse its existing readers/encryptors)
- Modify: the buyer setup wizard `phone` step (`src/components/buyer/steps/phone-step.tsx`) OR a new `connect_twilio` step component — add a "Connect your Twilio" field-set (accountSid + authToken) that calls the action; render it when telephony is needed and no trunk is set.

**Interfaces:**
- Consumes: `ensureBuilderTrunk` (D1), `createTwilioTelephonyClient` (`@/lib/telephony/twilio-client`), the org integrations writer/encryptor used by `resolveBuilderTelephony` (`@/lib/telephony/config`), `getOrgId` (`@/lib/auth/helpers`), `OPENAI_SIP_ORIGINATION_URI` (env, from D0).
- Produces: `connectBuilderTwilioAction(input: { accountSid: string; authToken: string }): Promise<{ ok: true } | { ok: false; error: "unauthorized" | "invalid_creds" | "trunk_failed" | "not_configured" }>`.

- [ ] **Step 1: Read** `config.ts` for exactly how `integrations.twilio` is read + decrypted, so the action writes the same shape (encrypt `authToken` with the same `v1.` scheme). Read `phone-step.tsx` for the wizard step pattern to mirror.

- [ ] **Step 2: Implement `connectBuilderTwilioAction`** (`"use server"`, exports only async fns):
  - `getOrgId()` guard → `unauthorized`.
  - Read `OPENAI_SIP_ORIGINATION_URI`; if unset → `{ ok:false, error:"not_configured" }` (inert without the platform config — money/безopasnost-safe).
  - `createTwilioTelephonyClient({ accountSid, authToken })`; validate creds with a cheap authed call (a `searchLocalVoiceNumbers` with a common area code, or a trunk list) — on auth failure → `invalid_creds`, store NOTHING.
  - `ensureBuilderTrunk({ originationSipUri: OPENAI_SIP_ORIGINATION_URI })` → on throw → `trunk_failed`, store nothing.
  - Persist `integrations.twilio.{accountSid, authToken(encrypted), voiceTrunkSid: trunkSid}` via the existing writer. Return `{ ok:true }`.

- [ ] **Step 3: Wire the wizard step** — add the connect-Twilio field-set to the `phone` step (or a `connect_twilio` step), calling the action; on success advance to "Get a number / forward a number" (the existing `provisionDeploymentNumberAction`/`activateDeploymentAction` now work because the trunk + creds exist).

- [ ] **Step 4: Verify** — `cd packages/crm && npx tsc --noEmit` + `pnpm check:use-server` (the action must export only async fns) + `pnpm build`.

- [ ] **Step 5: Commit** — `git add src/lib/telephony/connect-builder-twilio.ts src/lib/telephony/config.ts src/components/buyer/steps/phone-step.tsx && git commit -m "feat(telephony): BYO-Twilio connect step — paste SID+token, auto-create the SIP trunk"`

---

## Phase E — Full verify gate

### Task E1: Run the whole gate + report

- [ ] **Step 1:** crm — `cd packages/crm && node --import tsx --test tests/unit/deployments/calendar-connect-patch.spec.ts tests/unit/deployments/deploy-readiness.spec.ts tests/unit/telephony/ensure-builder-trunk.spec.ts` → all pass.
- [ ] **Step 2:** crm — `npx tsc --noEmit` → 0; `pnpm check:use-server` → passes; `pnpm build` → succeeds.
- [ ] **Step 3:** cli — `cd packages/cli && npm test` (payout + deploy specs discovered, all pass) + `npm run build` → clean.
- [ ] **Step 4:** Write a one-paragraph report of the gate results; note that `deploy_agent` going live needs Max to republish `@seldonframe/mcp`, and Part D needs `OPENAI_SIP_ORIGINATION_URI` + `SF_DEPLOY_ENABLED` set in Vercel (Max's action). Commit nothing (verification only).

---

## Self-Review notes (addressed)
- **Spec coverage:** A (booking fix) → Tasks A1-A2; B (computeDeployReadiness) → B1; C (deploy verb: route/CLI/MCP/builder-block) → C1-C3; D (auto-trunk + wizard connect) → D0-D2; money-safety + flag/inert threaded through every task's constraints. Positioning (copy leads with earn) noted in C3.
- **Idempotency:** re-deploy resolve-or-create (C1), trunk reuse (D1), calendar-patch no-downgrade (A1) — all covered.
- **Type consistency:** `DeployReadiness`/`DeployRequirement` defined in B1, consumed by C1/C3; `ensureBuilderTrunk` signature defined in D1, consumed by D2; `calendarConnectPatch` A1→A2. Names match across tasks.
- **Live-check gate (D0)** precedes the auto-trunk build so a per-project SIP surprise can't sink the phase mid-implementation.
