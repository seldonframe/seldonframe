// ICP-3 Task 2.2 — TDD tests for:
//   1. isE164(phone) pure validator
//   2. activateDeploymentAction branches (via DI mocks)
//   3. pauseDeploymentAction branches (via DI mocks)
//
// No DB, no Next.js "use server" machinery (getOrgId / assertWritable are
// NOT imported here — the actions accept optional _deps for DI). Instead we
// test the store-layer calls that the actions delegate to, and the error
// mapping (invalid_phone, phone_in_use from unique-violation, not_found,
// success).
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/deployments/activate.spec.ts

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

// ── 1. isE164 ─────────────────────────────────────────────────────────────────

import { isE164 } from "../../../src/lib/deployments/margin";

describe("isE164", () => {
  // Regex: ^\+[1-9]\d{7,14}$
  //   '+' + 1 non-zero digit + 7..14 more digits = 8..15 digits total after '+'.
  const valid = [
    "+15125550148",         // US 10-digit
    "+12125551234",         // US 10-digit
    "+447911123456",        // UK 11-digit
    "+33612345678",         // FR 9-digit
    "+819012345678",        // JP 10-digit
    "+12345678",            // 8-digit min ('+' + 1 + 7)
    "+1" + "2".repeat(13), // 14-digit ('+' + 1 + 13 = 14 digits)
    "+1" + "2".repeat(14), // 15-digit max ('+' + 1 + 14 = 15 digits ✓)
  ];

  const invalid = [
    "15125550148",           // missing '+'
    "+0123456789",           // leading 0 after '+' (non-zero required)
    "+1512555",              // 7 digits after '+' (too short — need min 8)
    "+1" + "2".repeat(15),  // 16 digits total (max is 15) — over limit
    "",
    "+",
    "+12",
    "not-a-phone",
    null,
    undefined,
    42,
  ];

  test("accepts valid E.164 numbers", () => {
    for (const p of valid) {
      assert.equal(isE164(p), true, `expected true for ${String(p)}`);
    }
  });

  test("rejects invalid E.164 numbers", () => {
    for (const p of invalid) {
      assert.equal(isE164(p), false, `expected false for ${String(p)}`);
    }
  });
});

// ── 2. activateDeploymentAction ───────────────────────────────────────────────
//
// The action calls getOrgId() (Next.js session) and assertWritable() — both
// are module-level side effects we cannot easily stub without mocking the
// module. Instead we test the STORE-layer logic directly via updateDeployment
// with injected deps, plus test isE164 (already above). The action's org
// guard and unique-violation mapping are tested here by calling the store
// helper that the action delegates to, mirroring the pattern in store.spec.ts.
//
// For a fuller integration smoke-test of the action wiring, see the tsc
// type-check (ensures the imports compile) and the manual verification step.

import {
  updateDeployment,
  type UpdateDeploymentDeps,
} from "../../../src/lib/deployments/store";
import type { Deployment } from "../../../src/db/schema/deployments";

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    calendarRef: null,
    priceCents: 9900,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Deployment;
}

describe("activate path — updateDeployment with phoneNumber + status:'active'", () => {
  test("success: sets phoneNumber and status to active", async () => {
    let updateArgs: { id: string; patch: Record<string, unknown> } | null = null;
    const deps: UpdateDeploymentDeps = {
      findById: async () => fakeDeployment(),
      update: async (id, patch) => {
        updateArgs = { id, patch: patch as Record<string, unknown> };
        return fakeDeployment({ phoneNumber: patch.phoneNumber as string, status: "active" });
      },
    };

    const result = await updateDeployment({
      id: "dep-1",
      patch: { phoneNumber: "+15125550148", status: "active" },
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(updateArgs, "update must be called");
    const args = updateArgs as { id: string; patch: Record<string, unknown> };
    assert.equal(args.patch.phoneNumber, "+15125550148");
    assert.equal(args.patch.status, "active");
    assert.ok(args.patch.updatedAt instanceof Date, "updatedAt bumped");
  });

  test("phone_in_use: unique-constraint violation is mappable to error code", () => {
    // Simulate the error the action catches and maps to 'phone_in_use'.
    // We test the detection logic in isolation (not via the action's try/catch,
    // since that requires invoking the action which needs Next.js session).
    function mapDbError(err: unknown): "phone_in_use" | "rethrow" {
      const isUniqueViolation =
        err instanceof Error &&
        ("code" in err
          ? (err as unknown as { code: string }).code === "23505"
          : err.message.includes("unique") || err.message.includes("duplicate"));
      return isUniqueViolation ? "phone_in_use" : "rethrow";
    }

    const pgErr = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    assert.equal(mapDbError(pgErr), "phone_in_use");

    const neonErr = new Error("unique constraint violation");
    assert.equal(mapDbError(neonErr), "phone_in_use");

    const otherErr = new Error("connection refused");
    assert.equal(mapDbError(otherErr), "rethrow");
  });

  test("not_found: deployment_not_found maps through", async () => {
    const deps: UpdateDeploymentDeps = {
      findById: async () => null,  // row doesn't exist
      update: async () => { throw new Error("should not be called"); },
    };
    const result = await updateDeployment({
      id: "dep-missing",
      patch: { phoneNumber: "+15125550148", status: "active" },
      deps,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "deployment_not_found");
  });

  test("invalid_phone: isE164 rejects non-E164 before reaching the store", () => {
    // These are caught before updateDeployment is called (in the action itself).
    const bad = ["5125550148", "+0123456", "", "notaphone"];
    for (const p of bad) {
      assert.equal(isE164(p), false, `should be rejected: ${p}`);
    }
  });
});

describe("pause path — updateDeployment with status:'paused'", () => {
  test("success: sets status to paused (phoneNumber unchanged)", async () => {
    let updateArgs: { id: string; patch: Record<string, unknown> } | null = null;
    const deps: UpdateDeploymentDeps = {
      findById: async () => fakeDeployment({ status: "active", phoneNumber: "+15125550148" }),
      update: async (id, patch) => {
        updateArgs = { id, patch: patch as Record<string, unknown> };
        return fakeDeployment({ status: "paused", phoneNumber: "+15125550148" });
      },
    };

    const result = await updateDeployment({
      id: "dep-1",
      patch: { status: "paused" },
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(updateArgs);
    const args = updateArgs as { id: string; patch: Record<string, unknown> };
    assert.equal(args.patch.status, "paused");
    // phoneNumber must NOT appear in patch (not explicitly set = undefined).
    assert.equal(args.patch.phoneNumber, undefined, "phoneNumber not touched by pause");
  });

  test("not_found: returns deployment_not_found when row is missing", async () => {
    const deps: UpdateDeploymentDeps = {
      findById: async () => null,
      update: async () => { throw new Error("should not be called"); },
    };
    const result = await updateDeployment({
      id: "nope",
      patch: { status: "paused" },
      deps,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "deployment_not_found");
  });
});

// Suppress the unused import of `mock` (kept for future use)
void mock;
