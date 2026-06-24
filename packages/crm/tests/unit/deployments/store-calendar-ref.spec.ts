// T7 — DeploymentPatch.calendarRef flows through updateDeployment (DI'd, no DB).
import { test } from "node:test";
import assert from "node:assert/strict";
import { updateDeployment } from "../../../src/lib/deployments/store";

test("updateDeployment writes calendarRef via the patch", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const existing = { id: "d1", builderOrgId: "o1" } as never;
  const res = await updateDeployment({
    id: "d1",
    patch: { calendarRef: { provider: "googlecalendar", accountId: "ca_1", calendarId: "primary" } },
    deps: {
      findById: async () => existing,
      update: async (_id: string, patch: Record<string, unknown>) => {
        captured.push(patch);
        return { ...(existing as object), ...patch } as never;
      },
    },
  });
  assert.equal(res.ok, true);
  assert.deepEqual(captured[0].calendarRef, {
    provider: "googlecalendar",
    accountId: "ca_1",
    calendarId: "primary",
  });
});

test("updateDeployment can null calendarRef", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const res = await updateDeployment({
    id: "d1",
    patch: { calendarRef: null },
    deps: {
      findById: async () => ({ id: "d1" } as never),
      update: async (_id: string, patch: Record<string, unknown>) => {
        captured.push(patch);
        return { id: "d1", ...patch } as never;
      },
    },
  });
  assert.equal(res.ok, true);
  assert.equal(captured[0].calendarRef, null);
});
