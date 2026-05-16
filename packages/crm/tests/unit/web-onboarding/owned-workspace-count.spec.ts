// packages/crm/tests/unit/web-onboarding/owned-workspace-count.spec.ts
//
// PATCHED PER PLAN CORRECTION (2026-05-16): we no longer test a parallel
// tier-limit decision helper — that machinery lives in lib/billing/limits.ts
// and is already covered there. This file only tests the small Drizzle
// helper that counts how many orgs the user owns. The result feeds the
// existing enforceWorkspaceLimit's `ownedWorkspaceCount` arg.
//
// We mock the db dependency rather than spinning up a real DB — keep this
// fully unit-testable. The shape we mock matches the actual query.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { countOwnedWorkspacesFromRows } from "../../../src/lib/web-onboarding/owned-workspace-count";

describe("countOwnedWorkspacesFromRows", () => {
  test("returns 0 when the user owns no orgs", () => {
    assert.equal(countOwnedWorkspacesFromRows([]), 0);
  });

  test("returns the count of rows when the user owns N orgs", () => {
    const rows = [{ orgId: "a" }, { orgId: "b" }, { orgId: "c" }];
    assert.equal(countOwnedWorkspacesFromRows(rows), 3);
  });

  test("deduplicates if the same orgId appears twice (defensive)", () => {
    const rows = [{ orgId: "a" }, { orgId: "a" }, { orgId: "b" }];
    assert.equal(countOwnedWorkspacesFromRows(rows), 2);
  });
});
