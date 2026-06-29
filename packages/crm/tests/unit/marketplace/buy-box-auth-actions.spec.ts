// Auth-gating contract for the PUBLIC listing buy-box server actions.
//
// The listing page is public + SEO (served on www + app, browsable logged-out).
// Its Install / Rent actions must NOT throw "Unauthorized" for a logged-out
// visitor — in production Next masks a thrown Server Action error to a generic
// "An error occurred… digest…" string, which the buy box renders as a scary
// error. Instead each returns a structured { ok:false, reason:"auth_required" }
// the client turns into a clean app-origin sign-in redirect.
//
// Both actions take an optional DI'd auth seam (default = the real helpers) so
// these run with NO Next.js session / NO Postgres — the repo idiom from
// set-booking-policy.spec.ts (tsx's CJS interop makes module-mocking the @/
// auth helpers unreliable).
//
// Run:
//   node --import tsx --test tests/unit/marketplace/buy-box-auth-actions.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { installAgentListingAction } from "../../../src/lib/marketplace/actions";
import { generateAgentRentalKeyAction } from "../../../src/lib/marketplace/rental";

// A user shape minimal enough for the `!user?.id` gate. Cast through unknown to
// the real helper's return type (the action only reads `.id`).
function fakeUser(id: string) {
  return { id } as unknown as Awaited<ReturnType<typeof import("../../../src/lib/auth/helpers").getCurrentUser>>;
}

describe("installAgentListingAction — auth gating (no masked throw)", () => {
  test("logged out (no user, no org) → { ok:false, reason:'auth_required' }, never throws", async () => {
    let result!: Awaited<ReturnType<typeof installAgentListingAction>>;
    await assert.doesNotReject(async () => {
      result = await installAgentListingAction(
        { slug: "ai-phone-receptionist" },
        { getCurrentUser: async () => null, getOrgId: async () => null },
      );
    });
    assert.deepEqual(result, { ok: false, reason: "auth_required" });
  });

  test("a user but no resolvable org (e.g. on www., cookie not sent) → auth_required", async () => {
    const result = await installAgentListingAction(
      { slug: "ai-phone-receptionist" },
      { getCurrentUser: async () => fakeUser("user-1"), getOrgId: async () => null },
    );
    assert.deepEqual(result, { ok: false, reason: "auth_required" });
  });

  test("AUTHENTICATED path passes the auth gate (does NOT return auth_required)", async () => {
    // With both a user AND an org, the action moves PAST the auth gate into the
    // listing lookup. We have no DB here, so that lookup throws a connection-ish
    // error — which is exactly the proof the gate was passed: the failure is NOT
    // the auth_required return and NOT an "Unauthorized" throw. (Max's $1 smoke
    // exercises the rest of the path against a real DB; this unit only pins that
    // a logged-in caller is never bounced by the auth gate.)
    let returned: unknown = undefined;
    let threw: unknown = undefined;
    try {
      returned = await installAgentListingAction(
        { slug: "ai-phone-receptionist" },
        { getCurrentUser: async () => fakeUser("user-1"), getOrgId: async () => "org-1" },
      );
    } catch (err) {
      threw = err;
    }

    // It must NOT have returned the auth_required shape …
    if (returned && typeof returned === "object" && "reason" in returned) {
      assert.notEqual(
        (returned as { reason?: string }).reason,
        "auth_required",
        "an authenticated caller must never be gated as auth_required",
      );
    }
    // … and if it threw, it's a downstream (DB) failure, NOT the old
    // "Unauthorized" auth throw.
    if (threw instanceof Error) {
      assert.ok(
        !/unauthorized/i.test(threw.message),
        `authenticated path must not throw Unauthorized, got: ${threw.message}`,
      );
    }
  });
});

describe("generateAgentRentalKeyAction — auth gating (no masked throw)", () => {
  test("logged out (no org) → { ok:false, reason:'auth_required' } (with an error string), never throws", async () => {
    let result!: Awaited<ReturnType<typeof generateAgentRentalKeyAction>>;
    await assert.doesNotReject(async () => {
      result = await generateAgentRentalKeyAction(
        { slug: "ai-phone-receptionist" },
        { getOrgId: async () => null },
      );
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && "reason" in result && result.reason === "auth_required", "reason is auth_required");
    // still carries a human-readable error for any non-redirect-aware caller
    assert.ok(!result.ok && typeof result.error === "string" && result.error.length > 0);
  });

  test("an empty slug while authed is rejected by validation (proves the gate is passed)", async () => {
    const result = await generateAgentRentalKeyAction(
      { slug: "   " },
      { getOrgId: async () => "org-1" },
    );
    assert.equal(result.ok, false);
    // Past the auth gate → the slug-required validation error, NOT auth_required.
    assert.ok(!result.ok && (!("reason" in result) || result.reason !== "auth_required"));
    assert.ok(!result.ok && /slug/i.test(result.error));
  });
});
