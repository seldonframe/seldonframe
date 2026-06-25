// Task 8 — setBookingPolicyAction (org-guarded).
//
// The action mirrors cancelDeploymentAction's shape (assertWritable → getOrgId →
// load + org-guard → updateDeployment → revalidatePath) and persists the
// per-client BookingPolicy on the deployment row. It's exercised here fully DI'd
// so it runs with NO DB / NO Next.js session: the optional 2nd `_deps` arg
// injects getOrgId / findById (the canonical loader the org-guard AND the inner
// updateDeployment both read) / update. This mirrors connect-calendar.spec.ts
// (which injects getOrgId/getDeployment) rather than mock.module, because tsx's
// CJS interop makes module-mocking the @/ auth helpers unreliable (see
// realtime-tools.spec.ts).
//
// Run:
//   node --import tsx --test tests/unit/deployments/set-booking-policy.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { setBookingPolicyAction } from "../../../src/lib/deployments/actions";
import type { Deployment } from "../../../src/db/schema/deployments";
import type { BookingPolicy } from "../../../src/lib/agents/booking/booking-policy";

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
    priceCents: 9900,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Deployment;
}

const POLICY: Partial<BookingPolicy> = {
  durationMinutes: 60,
  hours: { 2: { start: "10:00", end: "16:00" } }, // Tuesday only, 10–4
};

describe("setBookingPolicyAction", () => {
  test("unauthorized when there is no logged-in org", async () => {
    let updateCalled = false;
    const res = await setBookingPolicyAction(
      { deploymentId: DEP_ID, policy: POLICY },
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
    const res = await setBookingPolicyAction(
      { deploymentId: DEP_ID, policy: POLICY },
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
    const res = await setBookingPolicyAction(
      { deploymentId: DEP_ID, policy: POLICY },
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

  test("happy path: calls updateDeployment with the policy and returns ok", async () => {
    let patchSeen: Record<string, unknown> | null = null;
    const res = await setBookingPolicyAction(
      { deploymentId: DEP_ID, policy: POLICY },
      {
        getOrgId: async () => "builder-1",
        findById: async () => fakeDeployment(),
        update: async (id, patch) => {
          patchSeen = patch as Record<string, unknown>;
          assert.equal(id, DEP_ID);
          return fakeDeployment({ bookingPolicy: POLICY });
        },
        revalidate: () => {},
      },
    );
    assert.deepEqual(res, { ok: true });
    assert.ok(patchSeen, "update must be called");
    const patch = patchSeen as Record<string, unknown>;
    assert.deepEqual(patch.bookingPolicy, POLICY);
    assert.ok(patch.updatedAt instanceof Date, "updatedAt bumped");
  });

  test("a null policy clears the column (→ template/system defaults)", async () => {
    let patchSeen: Record<string, unknown> | null = null;
    const res = await setBookingPolicyAction(
      // null is a valid clear at the action boundary.
      { deploymentId: DEP_ID, policy: null as unknown as Partial<BookingPolicy> },
      {
        getOrgId: async () => "builder-1",
        findById: async () => fakeDeployment({ bookingPolicy: POLICY }),
        update: async (id, patch) => {
          patchSeen = patch as Record<string, unknown>;
          return fakeDeployment({ bookingPolicy: null });
        },
        revalidate: () => {},
      },
    );
    assert.deepEqual(res, { ok: true });
    const patch = patchSeen as unknown as Record<string, unknown>;
    assert.equal(patch.bookingPolicy, null);
  });
});
