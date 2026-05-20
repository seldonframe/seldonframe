// packages/crm/tests/unit/proposals/stripe-connect.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildConnectAccountParams, buildAccountLinkParams } from "@/lib/proposals/stripe-connect";

describe("buildConnectAccountParams", () => {
  test("returns Express type with US default", () => {
    const params = buildConnectAccountParams({
      agencyName: "Max Agency",
      agencyEmail: "max@example.com",
    });
    assert.equal(params.type, "express");
    assert.equal(params.country, "US");
    assert.equal(params.email, "max@example.com");
    assert.equal(params.business_profile?.name, "Max Agency");
    assert.equal(params.capabilities?.card_payments?.requested, true);
    assert.equal(params.capabilities?.transfers?.requested, true);
  });

  test("propagates country override", () => {
    const params = buildConnectAccountParams({
      agencyName: "Max Agency",
      agencyEmail: "max@example.com",
      country: "CA",
    });
    assert.equal(params.country, "CA");
  });
});

describe("buildAccountLinkParams", () => {
  test("sets return_url to the proposals onboarding return route", () => {
    const params = buildAccountLinkParams({
      stripeAccountId: "acct_123",
      baseUrl: "https://app.seldonframe.com",
    });
    assert.equal(params.account, "acct_123");
    assert.equal(params.type, "account_onboarding");
    assert.equal(
      params.return_url,
      "https://app.seldonframe.com/api/v1/proposals/connect/return?account_id=acct_123",
    );
    assert.equal(
      params.refresh_url,
      "https://app.seldonframe.com/proposals/onboarding?retry=1",
    );
  });
});
