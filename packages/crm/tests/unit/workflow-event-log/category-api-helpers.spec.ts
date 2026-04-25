// SLICE 1-a Commit 4 — library API helpers category per-site
// persistence tests. 5 files, 17 sites.

import { describe, test } from "node:test";

import { assertOrgIdExpr } from "./emit-site-extractor";

describe("SLICE 1-a — bookings/api.ts (3 sites)", () => {
  test("line 144 booking.created — input.orgId", () => {
    assertOrgIdExpr("src/lib/bookings/api.ts", 144, "input.orgId");
  });
  test("line 379 booking.cancelled — input.orgId", () => {
    assertOrgIdExpr("src/lib/bookings/api.ts", 379, "input.orgId");
  });
  test("line 501 booking.rescheduled — input.orgId", () => {
    assertOrgIdExpr("src/lib/bookings/api.ts", 501, "input.orgId");
  });
});

describe("SLICE 1-a — emails/api.ts (2 sites)", () => {
  test("line 38 email.suppressed — params.orgId", () => {
    assertOrgIdExpr("src/lib/emails/api.ts", 38, "params.orgId");
  });
  test("line 105 email.sent — params.orgId", () => {
    assertOrgIdExpr("src/lib/emails/api.ts", 105, "params.orgId");
  });
});

describe("SLICE 1-a — landing/api.ts (4 sites)", () => {
  test("line 95 landing.published (create flow) — input.orgId", () => {
    assertOrgIdExpr("src/lib/landing/api.ts", 95, "input.orgId");
  });
  test("line 159 landing.updated — input.orgId", () => {
    assertOrgIdExpr("src/lib/landing/api.ts", 159, "input.orgId");
  });
  test("line 206 landing.published (update flow) — params.orgId", () => {
    assertOrgIdExpr("src/lib/landing/api.ts", 206, "params.orgId");
  });
  test("line 217 landing.unpublished — params.orgId", () => {
    assertOrgIdExpr("src/lib/landing/api.ts", 217, "params.orgId");
  });
});

describe("SLICE 1-a — payments/api.ts (5 sites)", () => {
  test("line 91 invoice.created — input.orgId", () => {
    assertOrgIdExpr("src/lib/payments/api.ts", 91, "input.orgId");
  });
  test("line 118 invoice.sent — orgId", () => {
    assertOrgIdExpr("src/lib/payments/api.ts", 118, "orgId");
  });
  test("line 140 invoice.voided — orgId", () => {
    assertOrgIdExpr("src/lib/payments/api.ts", 140, "orgId");
  });
  test("line 214 subscription.created — input.orgId", () => {
    assertOrgIdExpr("src/lib/payments/api.ts", 214, "input.orgId");
  });
  test("line 253 subscription.cancelled — params.orgId", () => {
    assertOrgIdExpr("src/lib/payments/api.ts", 253, "params.orgId");
  });
});

describe("SLICE 1-a — sms/api.ts (3 sites)", () => {
  test("line 58 sms.suppressed — params.orgId", () => {
    assertOrgIdExpr("src/lib/sms/api.ts", 58, "params.orgId");
  });
  test("line 122 sms.sent — params.orgId", () => {
    assertOrgIdExpr("src/lib/sms/api.ts", 122, "params.orgId");
  });
  test("line 178 sms.failed — params.orgId", () => {
    assertOrgIdExpr("src/lib/sms/api.ts", 178, "params.orgId");
  });
});
