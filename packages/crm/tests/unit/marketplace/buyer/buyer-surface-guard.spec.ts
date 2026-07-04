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
  assert.equal(
    isBuyerOnlyOrg({ isAgencyOperator: false, hasBuyerDeployment: true, userHasOtherOrgs: false }),
    true,
  );
});

test("isBuyerOnlyOrg: an agency operator is NEVER buyer-only (even if they also bought an agent)", () => {
  assert.equal(
    isBuyerOnlyOrg({ isAgencyOperator: true, hasBuyerDeployment: true, userHasOtherOrgs: false }),
    false,
  );
  assert.equal(
    isBuyerOnlyOrg({ isAgencyOperator: true, hasBuyerDeployment: false, userHasOtherOrgs: false }),
    false,
  );
});

test("isBuyerOnlyOrg: a plain user with no buyer deployment is NOT buyer-only", () => {
  assert.equal(
    isBuyerOnlyOrg({ isAgencyOperator: false, hasBuyerDeployment: false, userHasOtherOrgs: false }),
    false,
  );
});

test("isBuyerOnlyOrg: a user who owns/belongs to ANY other org is NEVER buyer-only (multi-org escape)", () => {
  // A user who just claimed a workspace, or belongs to an agency under a
  // different org, must never be imprisoned in the buyer shell — the shell
  // is for single-purchase buyers only.
  assert.equal(
    isBuyerOnlyOrg({ isAgencyOperator: false, hasBuyerDeployment: true, userHasOtherOrgs: true }),
    false,
  );
  assert.equal(
    isBuyerOnlyOrg({ isAgencyOperator: true, hasBuyerDeployment: true, userHasOtherOrgs: true }),
    false,
  );
});

test("isAgencySurfacePath: matches /clients/new, /clients, /orgs (and their subpaths + query)", () => {
  assert.equal(isAgencySurfacePath("/clients/new"), true);
  assert.equal(isAgencySurfacePath("/clients/new?intent=build"), true);
  assert.equal(isAgencySurfacePath("/clients"), true);
  assert.equal(isAgencySurfacePath("/clients/abc-123"), true);
  assert.equal(isAgencySurfacePath("/orgs"), true);
});

test("isAgencySurfacePath: covers /studio/* and the other agency roots (Bug 2 — the full agency nav set)", () => {
  // The agency-builder Studio (the exact surface Max reported the buyer landing on).
  assert.equal(isAgencySurfacePath("/studio"), true);
  assert.equal(isAgencySurfacePath("/studio/agents"), true);
  assert.equal(isAgencySurfacePath("/studio/clients"), true);
  assert.equal(isAgencySurfacePath("/studio/earnings?tab=payouts"), true);
  // Every other left-nav root a buyer should never see.
  assert.equal(isAgencySurfacePath("/dashboard"), true);
  assert.equal(isAgencySurfacePath("/contacts"), true);
  assert.equal(isAgencySurfacePath("/contacts/c-1"), true);
  assert.equal(isAgencySurfacePath("/deals"), true);
  assert.equal(isAgencySurfacePath("/bookings"), true);
  assert.equal(isAgencySurfacePath("/forms"), true);
  assert.equal(isAgencySurfacePath("/conversations"), true);
  assert.equal(isAgencySurfacePath("/emails"), true);
  assert.equal(isAgencySurfacePath("/proposals"), true);
  assert.equal(isAgencySurfacePath("/automations"), true);
  assert.equal(isAgencySurfacePath("/integrations"), true);
  assert.equal(isAgencySurfacePath("/settings"), true);
  assert.equal(isAgencySurfacePath("/soul-marketplace"), true);
  assert.equal(isAgencySurfacePath("/seldon"), true);
});

test("isAgencySurfacePath: does NOT match the buyer's own surface or unrelated paths", () => {
  assert.equal(isAgencySurfacePath("/agent/dep-1"), false);
  assert.equal(isAgencySurfacePath("/agent/dep-1/setup"), false);
  assert.equal(isAgencySurfacePath("/"), false);
  assert.equal(isAgencySurfacePath("/login"), false);
  assert.equal(isAgencySurfacePath("/marketplace"), false);
  // Guard against accidental prefix collisions (substring ≠ path segment).
  assert.equal(isAgencySurfacePath("/clientside"), false);
  assert.equal(isAgencySurfacePath("/studious"), false);
  assert.equal(isAgencySurfacePath("/settings-export"), false);
  assert.equal(isAgencySurfacePath("/dashboards"), false);
});

test("shouldRedirectToBuyerAgent: a buyer on /studio is redirected to their agent (Bug 2)", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/studio/agents",
    isAgencyOperator: false,
    hasBuyerDeployment: true,
    userHasOtherOrgs: false,
    buyerDeploymentId: "dep-7",
  });
  assert.deepEqual(r, { redirect: true, to: "/agent/dep-7" });
});

test("shouldRedirectToBuyerAgent: a buyer on /clients/new is redirected to their agent", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/clients/new",
    isAgencyOperator: false,
    hasBuyerDeployment: true,
    userHasOtherOrgs: false,
    buyerDeploymentId: "dep-9",
  });
  assert.deepEqual(r, { redirect: true, to: "/agent/dep-9" });
});

test("shouldRedirectToBuyerAgent: an agency operator on /clients/new is NOT redirected", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/clients/new",
    isAgencyOperator: true,
    hasBuyerDeployment: true,
    userHasOtherOrgs: false,
    buyerDeploymentId: "dep-9",
  });
  assert.deepEqual(r, { redirect: false });
});

test("shouldRedirectToBuyerAgent: a buyer NOT on an agency surface is NOT redirected", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/agent/dep-9",
    isAgencyOperator: false,
    hasBuyerDeployment: true,
    userHasOtherOrgs: false,
    buyerDeploymentId: "dep-9",
  });
  assert.deepEqual(r, { redirect: false });
});

test("shouldRedirectToBuyerAgent: never redirect to a broken URL when no deployment id is known", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/clients/new",
    isAgencyOperator: false,
    hasBuyerDeployment: true,
    userHasOtherOrgs: false,
    buyerDeploymentId: null,
  });
  assert.deepEqual(r, { redirect: false });
});

test("shouldRedirectToBuyerAgent: a buyer who owns/belongs to another org is NEVER redirected to the buyer shell (multi-org escape)", () => {
  const r = shouldRedirectToBuyerAgent({
    pathname: "/clients/new",
    isAgencyOperator: false,
    hasBuyerDeployment: true,
    userHasOtherOrgs: true,
    buyerDeploymentId: "dep-9",
  });
  assert.deepEqual(r, { redirect: false });
});
