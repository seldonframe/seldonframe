// SLICE 1-a Commit 3 — portal category per-site persistence tests.
// 2 files, 4 sites.

import { describe, test } from "node:test";

import { assertOrgIdExpr } from "./emit-site-extractor";

describe("SLICE 1-a — portal/actions.ts (2 sites)", () => {
  test("line 79 portal.message_sent — session.orgId", () => {
    assertOrgIdExpr("src/lib/portal/actions.ts", 79, "session.orgId");
  });
  test("line 156 portal.resource_viewed — session.orgId", () => {
    assertOrgIdExpr("src/lib/portal/actions.ts", 156, "session.orgId");
  });
});

describe("SLICE 1-a — portal/auth.ts (2 sites)", () => {
  test("line 165 portal.login (access-code flow) — org.id", () => {
    assertOrgIdExpr("src/lib/portal/auth.ts", 165, "org.id");
  });
  test("line 261 portal.login (refresh flow) — session.orgId", () => {
    assertOrgIdExpr("src/lib/portal/auth.ts", 261, "session.orgId");
  });
});
