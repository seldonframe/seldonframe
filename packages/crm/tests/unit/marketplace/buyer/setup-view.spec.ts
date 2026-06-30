// Marketplace buyer onboarding — TDD for the setup-wizard VIEW assembler (pure).
//
// buildSetupWizardView(view) maps a loaded BuyerAgentView → the serializable
// per-step seed the client wizard renders: the business-info prefill (incl.
// reconstructing the HH:MM hours window from the structured booking policy), the
// connected-toolkit map, the phone seed, and the go-live recap. All pure.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSetupWizardView } from "../../../../src/lib/marketplace/buyer/setup-view";
import type { BuyerAgentView } from "../../../../src/lib/marketplace/buyer/buyer-deployment";
import type { OnboardingStep } from "../../../../src/lib/marketplace/onboarding/steps";

const RECEPTIONIST_STEPS: OnboardingStep[] = [
  { kind: "business_info", label: "About your business", required: true },
  { kind: "connect_tool", label: "Connect googlecalendar", required: false, toolkit: "googlecalendar" },
  { kind: "phone", label: "Your phone", required: true },
  { kind: "test", label: "Hear it work", required: false },
  { kind: "go_live", label: "Go live", required: true },
];

/** Build a minimal BuyerAgentView around a deployment patch. */
function makeView(deployment: Record<string, unknown>, steps = RECEPTIONIST_STEPS): BuyerAgentView {
  return {
    deployment: {
      id: "dep-1",
      builderOrgId: "org-1",
      clientName: "Northgate Plumbing",
      ...deployment,
    } as BuyerAgentView["deployment"],
    blueprint: {},
    steps,
    progress: { doneKinds: [] },
    nextStep: steps[0],
  };
}

test("business-info seed: prefers customization.businessInfo.name, falls back to clientName", () => {
  const withName = buildSetupWizardView(
    makeView({ customization: { businessInfo: { name: "Acme Plumbing" } } }),
  );
  assert.equal(withName.businessInfoSeed.name, "Acme Plumbing");

  const fallback = buildSetupWizardView(makeView({ customization: {} }));
  assert.equal(fallback.businessInfoSeed.name, "Northgate Plumbing");
});

test("business-info seed: maps services (price omitted when blank)", () => {
  const v = buildSetupWizardView(
    makeView({
      customization: {
        services: [
          { name: "Drain cleaning", price: "$140" },
          { name: "Inspection" }, // no price
        ],
      },
    }),
  );
  assert.deepEqual(v.businessInfoSeed.services, [
    { name: "Drain cleaning", price: "$140" },
    { name: "Inspection" },
  ]);
});

test("business-info seed: reconstructs the HH:MM hours window from the booking policy (Monday canonical)", () => {
  const v = buildSetupWizardView(
    makeView({
      bookingPolicy: {
        hours: {
          1: { start: "08:00", end: "18:00" },
          2: { start: "08:00", end: "18:00" },
        },
      },
    }),
  );
  assert.equal(v.businessInfoSeed.hoursOpen, "08:00");
  assert.equal(v.businessInfoSeed.hoursClose, "18:00");
});

test("business-info seed: blank hours when no booking policy", () => {
  const v = buildSetupWizardView(makeView({}));
  assert.equal(v.businessInfoSeed.hoursOpen, "");
  assert.equal(v.businessInfoSeed.hoursClose, "");
});

test("business-info seed: drops a malformed HH:MM window (not a valid <input type=time> value)", () => {
  const v = buildSetupWizardView(
    makeView({ bookingPolicy: { hours: { 1: { start: "8am", end: "later" } } } }),
  );
  assert.equal(v.businessInfoSeed.hoursOpen, "");
  assert.equal(v.businessInfoSeed.hoursClose, "");
});

test("connectedToolkits: keyed by each connect_tool toolkit; true only when calendarRef matches", () => {
  // Connected to google → its step reads connected.
  const connected = buildSetupWizardView(
    makeView({
      bookingMode: "api_mcp",
      calendarRef: { provider: "googlecalendar", accountId: "acc_1" },
    }),
  );
  assert.equal(connected.connectedToolkits.googlecalendar, true);

  // No accountId → not connected.
  const notConnected = buildSetupWizardView(
    makeView({ calendarRef: { provider: "googlecalendar" } }),
  );
  assert.equal(notConnected.connectedToolkits.googlecalendar, false);

  // calendarRef for a DIFFERENT provider → this toolkit still not connected.
  const mismatch = buildSetupWizardView(
    makeView({ calendarRef: { provider: "outlook", accountId: "acc_2" } }),
  );
  assert.equal(mismatch.connectedToolkits.googlecalendar, false);
});

test("phoneSeed: surfaces the current number + origin + required flag (voice agent → required)", () => {
  const v = buildSetupWizardView(
    makeView({
      phoneNumber: "+16025550148",
      numberOrigin: "provisioned",
      clientContact: { phone: "+16025551234" },
    }),
  );
  assert.equal(v.phoneSeed.phoneNumber, "+16025550148");
  assert.equal(v.phoneSeed.numberOrigin, "provisioned");
  assert.equal(v.phoneSeed.required, true); // a phone step is present
  assert.equal(v.phoneSeed.defaultAreaCode, "602"); // derived from contact phone
});

test("phoneSeed: a chat agent (no phone step) is not required", () => {
  const chatSteps: OnboardingStep[] = [
    { kind: "business_info", label: "About your business", required: true },
    { kind: "go_live", label: "Go live", required: true },
  ];
  const v = buildSetupWizardView(makeView({}, chatSteps));
  assert.equal(v.phoneSeed.required, false);
});

test("goLiveSummary: lists business, phone, and a connected calendar", () => {
  const v = buildSetupWizardView(
    makeView({
      customization: { businessInfo: { name: "Acme Plumbing" } },
      phoneNumber: "+16025550148",
      bookingMode: "api_mcp",
      calendarRef: { provider: "googlecalendar", accountId: "acc_1" },
    }),
  );
  const byLabel = Object.fromEntries(v.goLiveSummary.map((r) => [r.label, r.value]));
  assert.equal(byLabel.Business, "Acme Plumbing");
  assert.equal(byLabel.Phone, "+16025550148");
  assert.equal(byLabel.Calendar, "Google Calendar connected");
});

test("goLiveSummary: a voice agent with no number yet shows 'Not set up yet'", () => {
  const v = buildSetupWizardView(
    makeView({ customization: { businessInfo: { name: "Acme" } } }),
  );
  const phone = v.goLiveSummary.find((r) => r.label === "Phone");
  assert.equal(phone?.value, "Not set up yet");
});

test("tolerates an empty deployment (jsonb edges) without throwing", () => {
  const v = buildSetupWizardView(makeView({}));
  assert.equal(typeof v.businessInfoSeed.name, "string");
  assert.deepEqual(v.businessInfoSeed.services, []);
  assert.equal(v.phoneSeed.phoneNumber, null);
  assert.equal(v.connectedToolkits.googlecalendar, false);
});
