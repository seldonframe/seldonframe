// SLICE 1-a Commit 6 — API routes + runtime helpers category per-
// site persistence tests. 4 files, 7 sites.

import { describe, test } from "node:test";

import { assertOrgIdExpr } from "./emit-site-extractor";

describe("SLICE 1-a — api/v1/forms/submit/route.ts (2 sites)", () => {
  test("line 123 contact.created — orgId", () => {
    assertOrgIdExpr("src/app/api/v1/forms/submit/route.ts", 123, "orgId");
  });
  test("line 133 form.submitted — orgId", () => {
    assertOrgIdExpr("src/app/api/v1/forms/submit/route.ts", 133, "orgId");
  });
});

describe("SLICE 1-a — api/v1/landing/track-visit/route.ts (1 site)", () => {
  test("line 36 landing.visited — page.orgId", () => {
    assertOrgIdExpr("src/app/api/v1/landing/track-visit/route.ts", 36, "page.orgId");
  });
});

describe("SLICE 1-a — conversation/runtime.ts (2 sites)", () => {
  test("line 281 conversation.turn.received — input.orgId", () => {
    assertOrgIdExpr("src/lib/conversation/runtime.ts", 281, "input.orgId");
  });
  test("line 334 conversation.turn.sent — input.orgId", () => {
    assertOrgIdExpr("src/lib/conversation/runtime.ts", 334, "input.orgId");
  });
});

describe("SLICE 1-a — crm/custom-objects.ts (2 sites)", () => {
  test("line 1669 custom-object created — params.orgId", () => {
    assertOrgIdExpr("src/lib/crm/custom-objects.ts", 1669, "params.orgId");
  });
  test("line 1736 custom-object field_changed — params.orgId", () => {
    assertOrgIdExpr("src/lib/crm/custom-objects.ts", 1736, "params.orgId");
  });
});
