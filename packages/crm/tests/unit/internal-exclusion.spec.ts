// Task 10 — pins parseInternalIds' env-parsing contract and a basic
// shape guarantee for internalOrgPredicateSql (it must never throw,
// even with no ids configured, since that's the default prod state
// until SF_INTERNAL_USER_IDS / SF_INTERNAL_AGENCY_ID are set).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseInternalIds, internalOrgPredicateSql } from "@/lib/super-admin/internal-exclusion";

describe("parseInternalIds", () => {
  test("parses a normal comma-separated list", () => {
    const result = parseInternalIds({
      SF_INTERNAL_USER_IDS: "11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222",
      SF_INTERNAL_AGENCY_ID: "33333333-3333-3333-3333-333333333333",
    });
    assert.deepEqual(result, {
      userIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
      agencyId: "33333333-3333-3333-3333-333333333333",
    });
  });

  test("trims whitespace and drops empty entries", () => {
    const result = parseInternalIds({
      SF_INTERNAL_USER_IDS: " 11111111-1111-1111-1111-111111111111 , , 22222222-2222-2222-2222-222222222222,",
      SF_INTERNAL_AGENCY_ID: "   ",
    });
    assert.deepEqual(result, {
      userIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
      agencyId: null,
    });
  });

  test("absent env yields empty defaults", () => {
    const result = parseInternalIds({});
    assert.deepEqual(result, { userIds: [], agencyId: null });
  });
});

describe("internalOrgPredicateSql", () => {
  test("returns a defined sql fragment for empty ids without throwing", () => {
    const frag = internalOrgPredicateSql({ userIds: [], agencyId: null });
    assert.ok(frag, "expected a truthy sql fragment");
    assert.ok(Array.isArray(frag.queryChunks), "expected drizzle SQL queryChunks array");
  });

  test("returns a defined sql fragment when userIds and agencyId are set", () => {
    const frag = internalOrgPredicateSql({
      userIds: ["11111111-1111-1111-1111-111111111111"],
      agencyId: "33333333-3333-3333-3333-333333333333",
    });
    assert.ok(frag, "expected a truthy sql fragment");
    assert.ok(Array.isArray(frag.queryChunks), "expected drizzle SQL queryChunks array");
  });
});
