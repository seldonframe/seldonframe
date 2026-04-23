// SLICE 1-a Commit 2 — per-site persistence tests for the
// dashboard server-actions category.
//
// Category: 7 files, 23 sites. Each test asserts the orgId
// expression at the emit site references the correct variable
// from scope. Pairs with typecheck (signature correctness) and
// Commit 7's integration test (runtime persistence).
//
// Files covered:
//   lib/bookings/actions.ts  (6 sites)
//   lib/contacts/actions.ts  (2 sites)
//   lib/deals/actions.ts     (1 site)
//   lib/emails/actions.ts    (5 sites)
//   lib/forms/actions.ts     (2 sites)
//   lib/landing/actions.ts   (5 sites)
//   lib/payments/actions.ts  (2 sites)

import { describe, test } from "node:test";

import { assertOrgIdExpr } from "./emit-site-extractor";

describe("SLICE 1-a — bookings/actions.ts (6 sites)", () => {
  test("line 705 booking.created — orgId (from getOrgId())", () => {
    assertOrgIdExpr("src/lib/bookings/actions.ts", 705, "orgId");
  });
  test("line 751 booking.completed — orgId", () => {
    assertOrgIdExpr("src/lib/bookings/actions.ts", 751, "orgId");
  });
  test("line 789 booking.cancelled — orgId", () => {
    assertOrgIdExpr("src/lib/bookings/actions.ts", 789, "orgId");
  });
  test("line 833 booking.no_show — orgId", () => {
    assertOrgIdExpr("src/lib/bookings/actions.ts", 833, "orgId");
  });
  test("line 894 contact.created (nested createBookingContext) — bookingContext.orgId", () => {
    assertOrgIdExpr("src/lib/bookings/actions.ts", 894, "bookingContext.orgId");
  });
  test("line 1001 booking.created (nested createBookingContext) — bookingContext.orgId", () => {
    assertOrgIdExpr("src/lib/bookings/actions.ts", 1001, "bookingContext.orgId");
  });
});

describe("SLICE 1-a — contacts/actions.ts (2 sites)", () => {
  test("line 111 contact.created — orgId", () => {
    assertOrgIdExpr("src/lib/contacts/actions.ts", 111, "orgId");
  });
  test("line 242 contact.created (csv import) — orgId", () => {
    assertOrgIdExpr("src/lib/contacts/actions.ts", 242, "orgId");
  });
});

describe("SLICE 1-a — deals/actions.ts (1 site)", () => {
  test("line 146 deal.stage_changed — orgId", () => {
    assertOrgIdExpr("src/lib/deals/actions.ts", 146, "orgId");
  });
});

describe("SLICE 1-a — emails/actions.ts (5 sites)", () => {
  test("line 139 email.suppressed — params.orgId", () => {
    assertOrgIdExpr("src/lib/emails/actions.ts", 139, "params.orgId");
  });
  test("line 211 email.sent — params.orgId", () => {
    assertOrgIdExpr("src/lib/emails/actions.ts", 211, "params.orgId");
  });
  test("line 711 email.opened (markEmailOpened) — orgId", () => {
    assertOrgIdExpr("src/lib/emails/actions.ts", 711, "orgId");
  });
  test("line 732 email.opened (pixel) — row.orgId", () => {
    assertOrgIdExpr("src/lib/emails/actions.ts", 732, "row.orgId");
  });
  test("line 761 email.clicked — orgId", () => {
    assertOrgIdExpr("src/lib/emails/actions.ts", 761, "orgId");
  });
});

describe("SLICE 1-a — forms/actions.ts (2 sites)", () => {
  test("line 236 contact.created (form submission) — form.orgId", () => {
    assertOrgIdExpr("src/lib/forms/actions.ts", 236, "form.orgId");
  });
  test("line 255 form.submitted — form.orgId", () => {
    assertOrgIdExpr("src/lib/forms/actions.ts", 255, "form.orgId");
  });
});

describe("SLICE 1-a — landing/actions.ts (5 sites)", () => {
  test("line 319 landing.published — orgId", () => {
    assertOrgIdExpr("src/lib/landing/actions.ts", 319, "orgId");
  });
  test("line 330 landing.unpublished — orgId", () => {
    assertOrgIdExpr("src/lib/landing/actions.ts", 330, "orgId");
  });
  test("line 368 landing.visited — page.orgId", () => {
    assertOrgIdExpr("src/lib/landing/actions.ts", 368, "page.orgId");
  });
  test("line 432 contact.created (landing form submit) — org.id", () => {
    assertOrgIdExpr("src/lib/landing/actions.ts", 432, "org.id");
  });
  test("line 437 landing.converted — org.id", () => {
    assertOrgIdExpr("src/lib/landing/actions.ts", 437, "org.id");
  });
});

describe("SLICE 1-a — payments/actions.ts (2 sites)", () => {
  test("line 206 booking.created (checkout return) — orgId", () => {
    assertOrgIdExpr("src/lib/payments/actions.ts", 206, "orgId");
  });
  test("line 229 payment.completed — orgId", () => {
    assertOrgIdExpr("src/lib/payments/actions.ts", 229, "orgId");
  });
});
