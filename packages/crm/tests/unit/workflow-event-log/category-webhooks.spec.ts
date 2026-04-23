// SLICE 1-a Commit 5 — webhook handlers category per-site
// persistence tests. 3 files, 17 sites.
//
// Webhooks run outside the dashboard request lifecycle so
// they're the exact category that listeners.ts silently missed
// before SLICE 1-a. These tests anchor the structural fix:
// every webhook emission threads orgId and hits the durable log.

import { describe, test } from "node:test";

import { assertOrgIdExpr } from "./emit-site-extractor";

describe("SLICE 1-a — webhooks/resend/route.ts (4 sites)", () => {
  test("line 123 email.delivered — emailRow.orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/resend/route.ts", 123, "emailRow.orgId");
  });
  test("line 139 email.opened — emailRow.orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/resend/route.ts", 139, "emailRow.orgId");
  });
  test("line 156 email.clicked — emailRow.orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/resend/route.ts", 156, "emailRow.orgId");
  });
  test("line 176 email.bounced — emailRow.orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/resend/route.ts", 176, "emailRow.orgId");
  });
});

describe("SLICE 1-a — webhooks/stripe/connect/route.ts (9 sites)", () => {
  test("line 268 payment.failed — orgId (from resolveOrgByAccount)", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 268, "orgId");
  });
  test("line 305 payment.refunded — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 305, "orgId");
  });
  test("line 348 payment.disputed — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 348, "orgId");
  });
  test("line 379 invoice.sent — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 379, "orgId");
  });
  test("line 381 invoice.paid — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 381, "orgId");
  });
  test("line 388 invoice.past_due — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 388, "orgId");
  });
  test("line 394 invoice.voided — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 394, "orgId");
  });
  test("line 419 subscription.updated — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 419, "orgId");
  });
  test("line 425 subscription.trial_will_end — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/stripe/connect/route.ts", 425, "orgId");
  });
});

describe("SLICE 1-a — webhooks/twilio/sms/route.ts (4 sites)", () => {
  test("line 118 sms.delivered — params.orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/twilio/sms/route.ts", 118, "params.orgId");
  });
  test("line 135 sms.failed — params.orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/twilio/sms/route.ts", 135, "params.orgId");
  });
  test("line 238 sms.suppressed — orgId (inbound-handler scope)", () => {
    assertOrgIdExpr("src/app/api/webhooks/twilio/sms/route.ts", 238, "orgId");
  });
  test("line 258 sms.replied — orgId", () => {
    assertOrgIdExpr("src/app/api/webhooks/twilio/sms/route.ts", 258, "orgId");
  });
});
