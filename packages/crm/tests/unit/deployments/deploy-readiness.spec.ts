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
    // Every field but wizardPath is optional, so this is legitimately well-typed
    // (no @ts-expect-error needed) — the runtime behavior under test is that a
    // near-empty/malformed jsonb-shaped input still degrades to "ready".
    const r = computeDeployReadiness({ wizardPath: "/x" });
    assert.equal(r.ready, true); // nothing required found → ready
    assert.deepEqual(r.requirements, []);
  });
});
