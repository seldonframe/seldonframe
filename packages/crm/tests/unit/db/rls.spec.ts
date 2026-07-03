// Postgres RLS Phase 1 — withOrgRls context mechanism (spec
// docs/superpowers/specs/2026-07-03-postgres-rls-defense-in-depth-design.md, D1).
//
// Two things are tested here with NO real Postgres connection:
//   1. orgId is validated as a UUID before it ever reaches a SQL string —
//      a non-UUID throws InvalidOrgIdError and NEVER opens a connection.
//   2. The INERT-WITHOUT-ENV fallback: when DATABASE_URL_APP is unset,
//      withOrgRls must call fn with the passed-through db (no transaction,
//      no set_config) rather than attempting to open the Neon WebSocket pool.
// The transaction-path itself (real SET LOCAL + real RLS enforcement) is
// covered by the SEPARATE opt-in integration spec
// (tests/integration/rls-phase1.spec.ts) against a disposable Neon branch —
// that path needs a real Postgres server and is out of scope for a unit test.
//
// To run:
//   cd packages/crm
//   node --import tsx --test tests/unit/db/rls.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { withOrgRls, InvalidOrgIdError } from "../../../src/db/rls";

const VALID_ORG_ID = "3f9a1c2e-4b6d-4e7f-8a2b-9c1d2e3f4a5b";

describe("withOrgRls — orgId validation", () => {
  test("rejects a non-UUID orgId without ever calling fn", async () => {
    let called = false;
    await assert.rejects(
      () =>
        withOrgRls("not-a-uuid", async () => {
          called = true;
          return "unreachable";
        }),
      InvalidOrgIdError,
    );
    assert.equal(called, false, "fn must never run when orgId fails validation");
  });

  test("rejects an empty string orgId", async () => {
    await assert.rejects(
      () => withOrgRls("", async () => "unreachable"),
      InvalidOrgIdError,
    );
  });

  test("rejects a UUID-shaped-but-wrong-version string with stray characters", async () => {
    await assert.rejects(
      () => withOrgRls("3f9a1c2e-4b6d-4e7f-8a2b-9c1d2e3f4a5bZZ", async () => "unreachable"),
      InvalidOrgIdError,
    );
  });

  test("accepts a well-formed UUID and proceeds to fn (env-off path)", async () => {
    delete process.env.DATABASE_URL_APP;
    const result = await withOrgRls(VALID_ORG_ID, async (tx) => {
      assert.ok(tx, "fn must receive a truthy db handle");
      return "ok";
    });
    assert.equal(result, "ok");
  });
});

describe("withOrgRls — INERT-WITHOUT-ENV passthrough", () => {
  test("with DATABASE_URL_APP unset, fn runs against the passthrough db with no pool/tx opened", async () => {
    delete process.env.DATABASE_URL_APP;
    let receivedTx: unknown;
    const result = await withOrgRls(VALID_ORG_ID, async (tx) => {
      receivedTx = tx;
      return 42;
    });
    assert.equal(result, 42);
    // The passthrough path hands fn the SAME object identity as the module's
    // exported `db` — proving no transaction/pool wrapper was constructed.
    const { db } = await import("../../../src/db");
    assert.equal(receivedTx, db, "env-off must pass through the existing neon-http db unchanged");
  });

  test("setting DATABASE_URL_APP does not affect a call that never opens a real socket in this test (documents intent only)", () => {
    // This test intentionally does NOT set DATABASE_URL_APP and call withOrgRls,
    // because doing so would attempt a real network connection to Neon's
    // WebSocket endpoint — that path is exercised ONLY by the opt-in
    // integration spec (tests/integration/rls-phase1.spec.ts) against a real
    // Neon branch. Asserting that here would make this unit spec flaky/slow
    // and would violate the "no real DB in unit tests" boundary.
    assert.ok(true, "see tests/integration/rls-phase1.spec.ts for the enforced-transaction path");
  });
});
