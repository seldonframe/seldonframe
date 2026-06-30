// Marketplace buyer onboarding — TDD for the buyer-surface guard predicate.
//
// The guard must keep BUYERS off agency surfaces WITHOUT regressing agency
// operators. These tests pin: the buyer-only classification, the agency-surface
// path match, and the combined redirect decision (incl. the never-redirect-to-a-
// broken-URL guard when no deployment id is known).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isBuyerOnlyOrg,
  isAgencySurfacePath,
  shouldRedirectToBuyerAgent,
} from "../../../../src/lib/marketplace/buyer/buyer-surface-guard";

test("isBuyerOnlyOrg: a buyer (owns a buyer deployment, not an agency) is buyer-only", () => {
  assert.equal(isBuyerOnlyOrg({ isAgencyOperator: false, hasBuyerDeployment: true }), true);
});

test("isBuyerOnlyOrg: an agency operator is NEVER buyer-only (even if they also bought an agent)", () => {
  assert.equal(isBuyerOnlyOrg({ isAgencyOperator: true, hasBuyerDeployment: true }), false);
  assert.equal(isBuyerOnlyOrg({ isAgencyOperator: true, hasBuyerDeployment: false }), false);
});

test("isBuyerOnlyOrg: a plain user with no buyer deployment is NOT buyer-only", () => {
  assert.equal(isBuyerOnlyOrg({ isAgencyOperator: false, hasBuyerDeployment: false }), false);
});

test("isAgencySurfacePath: matches /clients/new, /clients, /orgs (and their subpaths + query)", () => {
  assert.equal(isAgencySurfacePath("/clients/new"), true);
  assert.equal(isAgencySurfacePath("/clients/new?intent=build"), true);
  assert.equal(isAgencySurfacePath("/clients"), true);
  assert.equal(isAgencySurfacePath("/clients/abc-123"), true);
  assert.equal(isAgencySurfacePath("/orgs"), true);
});

test("isAgencySurfacePath: does NOT match the buyer's own surface or unrelated paths", () => {
  assert.equal(isAgencySurfacePath("/agent/dep-1"), false);
  assert.equal(isAgencySurfacePath("/agent/dep-1/setup"), false);
  assert.equal(isAgencySurfacePath("/dashboard"), false);
  assert.equal(isAgencySurfacePath("/settings"), false);
  // Guard against an accidental prefix collision (/clientside should NOT match).
  assert.equal(isAgencySurfacePath("/clientside"), false);
});

test("shouldRedirectToBuyerAgent: a buyer on /clients/new is redirected to their agent", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/clients/new",
    isAgencyOperator: false,
    hasBuyerDeployment: true,
    buyerDeploymentId: "dep-9",
  });
  assert.deepEqual(r, { redirect: true, to: "/agent/dep-9" });
});

test("shouldRedirectToBuyerAgent: an agency operator on /clients/new is NOT redirected", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/clients/new",
    isAgencyOperator: true,
    hasBuyerDeployment: true,
    buyerDeploymentId: "dep-9",
  });
  assert.deepEqual(r, { redirect: false });
});

test("shouldRedirectToBuyerAgent: a buyer NOT on an agency surface is NOT redirected", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/agent/dep-9",
    isAgencyOperator: false,
    hasBuyerDeployment: true,
    buyerDeploymentId: "dep-9",
  });
  assert.deepEqual(r, { redirect: false });
});

test("shouldRedirectToBuyerAgent: never redirect to a broken URL when no deployment id is known", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/clients/new",
    isAgencyOperator: false,
    hasBuyerDeployment: true,
    buyerDeploymentId: null,
  });
  assert.deepEqual(r, { redirect: false });
});
