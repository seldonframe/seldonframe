// Task 4 — setDeploymentCustomizationAction (org-guarded).
//
// Mirrors set-booking-policy.spec.ts exactly: the action follows the same shape
// (assertWritable → getOrgId → load + org-guard → updateDeployment →
// revalidatePath) but persists the per-client agent-persona override
// (greeting / voiceId / businessInfo) on the deployment row. Exercised fully
// DI'd so it runs with NO DB / NO Next.js session: the optional 2nd `_deps` arg
// injects getOrgId / findById (the canonical loader the org-guard AND the inner
// updateDeployment both read) / update / revalidate.
//
// Run:
//   node --import tsx --test tests/unit/deployments/set-deployment-customization.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { setDeploymentCustomizationAction } from "../../../src/lib/deployments/actions";
import type { Deployment } from "../../../src/db/schema/deployments";
import type { DeploymentCustomization } from "../../../src/lib/agents/persona/deployment-customization";

const DEP_ID = "11111111-1111-4111-8111-111111111111";

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: DEP_ID,
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    calendarRef: null,
    bookingPolicy: null,
    customization: null,
    priceCents: 9900,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Deployment;
}

const CUSTOMIZATION: Partial<DeploymentCustomization> = {
  greeting: "Thanks for calling Acme Plumbing — how can I help?",
  voiceId: "cedar",
  businessInfo: { name: "Acme Plumbing", hours: "Mon–Fri 9–5", phone: "+15551234567" },
};

describe("setDeploymentCustomizationAction", () => {
  test("unauthorized when there is no logged-in org", async () => {
    let updateCalled = false;
    const res = await setDeploymentCustomizationAction(
      { deploymentId: DEP_ID, customization: CUSTOMIZATION },
      {
        getOrgId: async () => null,
        findById: async () => fakeDeployment(),
        update: async () => {
          updateCalled = true;
          return fakeDeployment();
        },
      },
    );
    assert.deepEqual(res, { ok: false, error: "unauthorized" });
    assert.equal(updateCalled, false, "must not write when unauthorized");
  });

  test("not_found when the deployment is missing", async () => {
    const res = await setDeploymentCustomizationAction(
      { deploymentId: DEP_ID, customization: CUSTOMIZATION },
      {
        getOrgId: async () => "builder-1",
        findById: async () => null,
        update: async () => fakeDeployment(),
      },
    );
    assert.deepEqual(res, { ok: false, error: "not_found" });
  });

  test("not_found on builder mismatch (org guard)", async () => {
    let updateCalled = false;
    const res = await setDeploymentCustomizationAction(
      { deploymentId: DEP_ID, customization: CUSTOMIZATION },
      {
        getOrgId: async () => "builder-1",
        findById: async () => fakeDeployment({ builderOrgId: "someone-else" }),
        update: async () => {
          updateCalled = true;
          return fakeDeployment();
        },
      },
    );
    assert.deepEqual(res, { ok: false, error: "not_found" });
    assert.equal(updateCalled, false, "must not write for the wrong org");
  });

  test("happy path: calls updateDeployment with the customization and returns ok", async () => {
    let patchSeen: Record<string, unknown> | null = null;
    const res = await setDeploymentCustomizationAction(
      { deploymentId: DEP_ID, customization: CUSTOMIZATION },
      {
        getOrgId: async () => "builder-1",
        findById: async () => fakeDeployment(),
        update: async (id, patch) => {
          patchSeen = patch as Record<string, unknown>;
          assert.equal(id, DEP_ID);
          return fakeDeployment({ customization: CUSTOMIZATION });
        },
        revalidate: () => {},
      },
    );
    assert.deepEqual(res, { ok: true });
    assert.ok(patchSeen, "update must be called");
    const patch = patchSeen as Record<string, unknown>;
    assert.deepEqual(patch.customization, CUSTOMIZATION);
    assert.ok(patch.updatedAt instanceof Date, "updatedAt bumped");
  });

  test("a null customization clears the column (→ the template's defaults)", async () => {
    let patchSeen: Record<string, unknown> | null = null;
    const res = await setDeploymentCustomizationAction(
      { deploymentId: DEP_ID, customization: null },
      {
        getOrgId: async () => "builder-1",
        findById: async () => fakeDeployment({ customization: CUSTOMIZATION }),
        update: async (id, patch) => {
          patchSeen = patch as Record<string, unknown>;
          return fakeDeployment({ customization: null });
        },
        revalidate: () => {},
      },
    );
    assert.deepEqual(res, { ok: true });
    const patch = patchSeen as unknown as Record<string, unknown>;
    assert.equal(patch.customization, null);
  });
});
