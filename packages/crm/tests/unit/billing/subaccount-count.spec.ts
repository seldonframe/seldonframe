// 2026-07-08 post-review fix wave — spec invariant 5 (sub-account cap
// bypassable + miscounts, BLOCKING). Pins the REFINED counting rule:
// a counted sub-account = org with parentAgencyId IN (agencies owned
// by the user) AND archivedAt IS NULL AND ownerId IS DISTINCT FROM the
// agency owner's userId.
//
// Two previously-ungated write paths motivated this:
//   1. deployments/store.ts::setOrgParentAgency (via
//      provisionClientWorkspaceForDeployment) — the deploy-to-client
//      flow. Real client handoffs; MUST count and MUST be gated
//      (see provision-client-workspace.spec.ts for the gate itself).
//   2. agency-profile/sync-to-partner-agency.ts's bulk-attach on
//      profile save — attaches the AGENCY OWNER'S OWN branding
//      workspaces (organizations.ownerId = the saving user). These are
//      not client handoffs and must NOT count against the cap (an
//      indiscriminate count would produce false rejections purely
//      from an operator saving their profile).
//
// isCountableClientSubAccount is the pure predicate the live SQL
// query (countClientSubAccountsForOwner) encodes — tested directly so
// the two can be trusted to agree without a DB.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  isCountableClientSubAccount,
  type SubAccountCandidateOrg,
} from "@/lib/billing/subaccount-count";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER_OWNER = "22222222-2222-2222-2222-222222222222";
const AGENCY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const AGENCY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NOT_OWNED_AGENCY = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function org(over: Partial<SubAccountCandidateOrg> = {}): SubAccountCandidateOrg {
  return {
    id: "org-1",
    parentAgencyId: AGENCY_A,
    archivedAt: null,
    ownerId: OTHER_OWNER,
    ...over,
  };
}

describe("isCountableClientSubAccount — the refined counting rule", () => {
  test("counts a genuine client handoff: parentAgencyId owned by the user, different owner, not archived", () => {
    const result = isCountableClientSubAccount(
      org({ parentAgencyId: AGENCY_A, ownerId: OTHER_OWNER, archivedAt: null }),
      { ownerUserId: OWNER, ownedAgencyIds: [AGENCY_A, AGENCY_B] },
    );
    assert.equal(result, true);
  });

  test("counts an anonymous (ownerId null) client workspace attached to an owned agency", () => {
    const result = isCountableClientSubAccount(
      org({ parentAgencyId: AGENCY_A, ownerId: null }),
      { ownerUserId: OWNER, ownedAgencyIds: [AGENCY_A] },
    );
    assert.equal(result, true);
  });

  // The core fix — the OTHER previously-ungated write path
  // (sync-to-partner-agency.ts) attaches the agency owner's OWN
  // workspaces (ownerId === the saving user). These must NOT count.
  test("EXCLUDES an owner-owned org (self-branding attach via sync-to-partner-agency) — the bug this fixes", () => {
    const result = isCountableClientSubAccount(
      org({ parentAgencyId: AGENCY_A, ownerId: OWNER }),
      { ownerUserId: OWNER, ownedAgencyIds: [AGENCY_A] },
    );
    assert.equal(result, false);
  });

  test("excludes an org with no parentAgencyId (unattached)", () => {
    const result = isCountableClientSubAccount(
      org({ parentAgencyId: null }),
      { ownerUserId: OWNER, ownedAgencyIds: [AGENCY_A] },
    );
    assert.equal(result, false);
  });

  test("excludes an org attached to an agency the user does NOT own", () => {
    const result = isCountableClientSubAccount(
      org({ parentAgencyId: NOT_OWNED_AGENCY }),
      { ownerUserId: OWNER, ownedAgencyIds: [AGENCY_A, AGENCY_B] },
    );
    assert.equal(result, false);
  });

  test("excludes an archived org even if otherwise countable", () => {
    const result = isCountableClientSubAccount(
      org({ parentAgencyId: AGENCY_A, ownerId: OTHER_OWNER, archivedAt: new Date("2026-01-01") }),
      { ownerUserId: OWNER, ownedAgencyIds: [AGENCY_A] },
    );
    assert.equal(result, false);
  });

  test("a mixed set: only the genuine client handoff counts, the owner-owned + archived + unowned-agency orgs don't", () => {
    const orgs: SubAccountCandidateOrg[] = [
      org({ id: "client-1", parentAgencyId: AGENCY_A, ownerId: OTHER_OWNER }), // counts
      org({ id: "self-branded", parentAgencyId: AGENCY_A, ownerId: OWNER }), // excluded (sync-to-partner-agency bug)
      org({ id: "archived-client", parentAgencyId: AGENCY_A, ownerId: OTHER_OWNER, archivedAt: new Date() }), // excluded
      org({ id: "other-agency", parentAgencyId: NOT_OWNED_AGENCY, ownerId: OTHER_OWNER }), // excluded
      org({ id: "anon-client", parentAgencyId: AGENCY_B, ownerId: null }), // counts
    ];
    const params = { ownerUserId: OWNER, ownedAgencyIds: [AGENCY_A, AGENCY_B] };
    const counted = orgs.filter((o) => isCountableClientSubAccount(o, params));
    assert.deepEqual(counted.map((o) => o.id), ["client-1", "anon-client"]);
  });
});
