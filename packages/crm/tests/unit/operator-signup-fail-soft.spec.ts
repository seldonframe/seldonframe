// 2026-07-02 — /api/v1/leads/operator-signup 500 fix.
//
// Production bug: SELDONFRAME_OPS_WORKSPACE_ID resolved to a well-formed
// UUID with no matching `organizations` row. The insert threw Postgres
// 23503 (foreign_key_violation on contacts_org_id_organizations_id_fk)
// with zero try/catch around it, so every real prospect's signup 500'd
// (confirmed via prod Vercel runtime logs, 2026-07-02).
//
// The route inlines its DB calls against the live Drizzle client, so it
// isn't practical to unit-test the handler directly without a real DB.
// What IS load-bearing and worth pinning here is the *decision shape* the
// fix introduces: given the two concrete failure modes seen (and any
// other insert-time throw), the handler must resolve to a soft 200
// `{ ok: true, recorded: false }` — never propagate a 500. We exercise
// that decision logic with a minimal fake standing in for the two db
// calls the route makes (the org-existence check, then the insert),
// using the same control flow the route follows.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

type OpsSignupResult =
  | { status: 200; ok: true; recorded: true; reason?: undefined }
  | { status: 200; ok: true; recorded: false; reason: string }
  | { status: 500; ok: false };

/**
 * Mirrors the try/catch + org-existence-guard control flow added to
 * route.ts's POST handler. Takes stand-ins for the two DB calls so the
 * decision logic can be exercised without a live database.
 */
async function runOpsSignupDecision(deps: {
  findOrg: () => Promise<{ id: string } | undefined>;
  insertContact: () => Promise<{ id: string }>;
}): Promise<OpsSignupResult> {
  try {
    const org = await deps.findOrg();
    if (!org) {
      return { status: 200, ok: true, recorded: false, reason: "ops_workspace_not_found" };
    }
    const created = await deps.insertContact();
    if (!created) {
      throw new Error("Insert returned no row.");
    }
    return { status: 200, ok: true, recorded: true };
  } catch {
    // Defense in depth: any other DB error (transient Neon failure,
    // future schema drift, etc.) must not bounce the prospect either.
    return { status: 200, ok: true, recorded: false, reason: "lead_capture_failed" };
  }
}

describe("operator-signup — org-existence guard", () => {
  test("org row missing (the exact prod failure mode) resolves to soft 200, not a throw", async () => {
    const result = await runOpsSignupDecision({
      findOrg: async () => undefined, // SELDONFRAME_OPS_WORKSPACE_ID points at no row
      insertContact: async () => {
        throw new Error(
          "should never be called — the org guard must short-circuit before the insert"
        );
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.ok, true);
    assert.equal(result.recorded, false);
    assert.equal((result as { reason: string }).reason, "ops_workspace_not_found");
  });

  test("org exists → insert proceeds and reports recorded:true", async () => {
    const result = await runOpsSignupDecision({
      findOrg: async () => ({ id: "6fd1d5d5-34a8-4805-becd-842ca1423afd" }),
      insertContact: async () => ({ id: "new-contact-id" }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.ok, true);
    assert.equal(result.recorded, true);
  });
});

describe("operator-signup — defense-in-depth catch", () => {
  test("insert throws a Postgres FK-violation-shaped error → soft 200, never a 500", async () => {
    const result = await runOpsSignupDecision({
      findOrg: async () => ({ id: "6fd1d5d5-34a8-4805-becd-842ca1423afd" }),
      insertContact: async () => {
        // Shape of the actual NeonDbError seen in prod logs.
        const err = new Error(
          'insert or update on table "contacts" violates foreign key constraint "contacts_org_id_organizations_id_fk"'
        );
        (err as Error & { code?: string }).code = "23503";
        throw err;
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.ok, true);
    assert.equal(result.recorded, false);
    assert.equal((result as { reason: string }).reason, "lead_capture_failed");
  });

  test("any other unexpected throw (transient DB error) also resolves to soft 200", async () => {
    const result = await runOpsSignupDecision({
      findOrg: async () => ({ id: "6fd1d5d5-34a8-4805-becd-842ca1423afd" }),
      insertContact: async () => {
        throw new Error("Connection terminated unexpectedly");
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.recorded, false);
  });

  test("no path in this decision tree returns a 500", async () => {
    const scenarios = [
      runOpsSignupDecision({
        findOrg: async () => undefined,
        insertContact: async () => ({ id: "x" }),
      }),
      runOpsSignupDecision({
        findOrg: async () => ({ id: "org-1" }),
        insertContact: async () => {
          throw new Error("anything");
        },
      }),
      runOpsSignupDecision({
        findOrg: async () => ({ id: "org-1" }),
        insertContact: async () => ({ id: "y" }),
      }),
    ];
    const results = await Promise.all(scenarios);
    for (const r of results) {
      assert.equal(r.status, 200, `expected 200, got ${r.status}`);
    }
  });
});
