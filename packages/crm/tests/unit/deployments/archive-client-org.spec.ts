// Front-office bridge — tests for archiveClientOrg + the active-org filter
// predicate (lib/deployments/store.ts archive helpers).
//
// On cancel, a deployment's provisioned CLIENT workspace is ARCHIVED (data
// retained, never deleted) by stamping organizations.archivedAt. The deployment
// keeps its clientOrgId (reactivation/handoff path). Archived orgs must be
// excluded from every "active workspace" list + the BILLING workspace-count, so
// an archived client org never counts against the builder's limit or triggers a
// charge.
//
// archiveClientOrg DI's its `update` + `now` seams so the patch shape is asserted
// with no DB; isOrgActiveRow is a pure predicate mirroring the SQL
// `archivedAt IS NULL` filter for fixture-level coverage.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  archiveClientOrg,
  isOrgActiveRow,
} from "../../../src/lib/deployments/store";

describe("archiveClientOrg", () => {
  test("stamps archivedAt = now on the target org (DI update + clock)", async () => {
    const when = new Date("2026-06-21T15:30:00Z");
    let updateArgs: { id: string; patch: { archivedAt: Date } } | null = null;
    await archiveClientOrg(
      { orgId: "client-org-7", now: () => when },
      {
        update: async (id, patch) => {
          updateArgs = { id, patch };
        },
      },
    );
    assert.ok(updateArgs, "update must be called");
    const args = updateArgs as { id: string; patch: { archivedAt: Date } };
    assert.equal(args.id, "client-org-7");
    assert.equal(args.patch.archivedAt, when);
  });

  test("defaults the clock to new Date when not injected (still stamps a Date)", async () => {
    let captured: unknown = null;
    await archiveClientOrg(
      { orgId: "client-org-8" },
      {
        update: async (_id, patch) => {
          captured = patch.archivedAt;
        },
      },
    );
    assert.ok(captured instanceof Date, "archivedAt is a Date even with the default clock");
  });

  test("patches ONLY archivedAt — never deletes the org or its link (data retained)", async () => {
    let patchKeys: string[] = [];
    await archiveClientOrg(
      { orgId: "client-org-9", now: () => new Date("2026-06-21T00:00:00Z") },
      {
        update: async (_id, patch) => {
          patchKeys = Object.keys(patch);
        },
      },
    );
    // Archive is a soft stamp: the only field written is archivedAt. The org row
    // (and the deployment's clientOrgId link to it) is never deleted/nulled —
    // the agency can reactivate or hand off later.
    assert.deepEqual(patchKeys, ["archivedAt"]);
  });
});

describe("isOrgActiveRow — archived-org filter predicate", () => {
  test("an org with no archivedAt is active", () => {
    assert.equal(isOrgActiveRow({ archivedAt: null }), true);
  });

  test("an org with an archivedAt timestamp is NOT active (excluded from lists/count)", () => {
    assert.equal(isOrgActiveRow({ archivedAt: new Date("2026-06-21T00:00:00Z") }), false);
  });
});
