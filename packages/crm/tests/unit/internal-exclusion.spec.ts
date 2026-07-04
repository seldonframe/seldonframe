// Task 10 — pins parseInternalIds' env-parsing contract and the actual
// rendered SQL shape of internalOrgPredicateSql (it must never throw,
// even with no ids configured, since that's the default prod state
// until SF_INTERNAL_USER_IDS / SF_INTERNAL_AGENCY_ID are set — and the
// clauses it does emit must be correct, parameterized, and additive).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";

import { parseInternalIds, internalOrgPredicateSql } from "@/lib/super-admin/internal-exclusion";

const dialect = new PgDialect();

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
  test("empty ids: renders only the preview_mode clause, no owner/agency columns", () => {
    const frag = internalOrgPredicateSql({ userIds: [], agencyId: null });
    const { sql: text } = dialect.sqlToQuery(frag);
    assert.match(text, /preview_mode/, "expected preview_mode in rendered SQL");
    assert.doesNotMatch(text, /owner_id/, "did not expect owner_id when userIds is empty");
    assert.doesNotMatch(text, /parent_user_id/, "did not expect parent_user_id when userIds is empty");
    assert.doesNotMatch(text, /parent_agency_id/, "did not expect parent_agency_id when agencyId is null");
  });

  test("userIds only: owner/parent_user clauses present, agency clause absent", () => {
    const frag = internalOrgPredicateSql({
      userIds: ["11111111-1111-1111-1111-111111111111"],
      agencyId: null,
    });
    const { sql: text } = dialect.sqlToQuery(frag);
    assert.match(text, /owner_id/);
    assert.match(text, /parent_user_id/);
    assert.doesNotMatch(text, /parent_agency_id/, "did not expect parent_agency_id when agencyId is null");
  });

  test("full ids: all four clauses present, three ORs, ids parameterized not inlined", () => {
    const userIds = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ];
    const agencyId = "33333333-3333-3333-3333-333333333333";
    const frag = internalOrgPredicateSql({ userIds, agencyId });
    const { sql: text, params } = dialect.sqlToQuery(frag);

    assert.match(text, /owner_id/);
    assert.match(text, /parent_user_id/);
    assert.match(text, /parent_agency_id/);
    assert.match(text, /preview_mode/);

    const orCount = (text.match(/ or /gi) ?? []).length;
    assert.equal(orCount, 3, `expected 3 " or " separators between the 4 clauses, got ${orCount} in: ${text}`);

    // Ids must be bound as parameters, never string-concatenated into the SQL text.
    for (const id of userIds) {
      assert.ok(!text.includes(id), `expected id ${id} to be parameterized, not inlined in SQL text`);
      assert.ok(params.includes(id), `expected id ${id} to appear in bound params`);
    }
    assert.ok(!text.includes(agencyId), "expected agencyId to be parameterized, not inlined in SQL text");
    assert.ok(params.includes(agencyId), "expected agencyId to appear in bound params");
  });
});
