// Unit tests for the Tier-2 (BYO OpenAI project) per-org webhook auth
// decision (spec 2026-07-01-voice-deploy-metered-billing, Task 8). PURE
// function — no DB, no network, no mocking — so every branch + the ORDER
// between branches is asserted directly.
//
// Follows the repo's node:test + node:assert/strict convention (see
// openai-webhook-verify.spec.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { decideTier2Call } from "../../../../src/lib/agents/voice/tier2-auth";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG_ID = "22222222-2222-2222-2222-222222222222";

/** A fully-happy input; each test overrides only the field(s) under test. */
function baseInput(overrides: Partial<Parameters<typeof decideTier2Call>[0]> = {}) {
  return {
    orgId: ORG_ID,
    verified: true,
    deploymentBuilderOrgId: ORG_ID,
    storedKeyPresent: true,
    ...overrides,
  };
}

describe("decideTier2Call — happy path", () => {
  test("verified + deployment resolved + org matches + key present -> ok", () => {
    const result = decideTier2Call(baseInput());
    assert.deepEqual(result, { ok: true });
  });
});

describe("decideTier2Call — rejection branches", () => {
  test("not verified -> 401 bad_signature", () => {
    const result = decideTier2Call(baseInput({ verified: false }));
    assert.deepEqual(result, { ok: false, status: 401, reason: "bad_signature" });
  });

  test("no deployment resolved for the dialed number -> 404 no_deployment", () => {
    const result = decideTier2Call(baseInput({ deploymentBuilderOrgId: null }));
    assert.deepEqual(result, { ok: false, status: 404, reason: "no_deployment" });
  });

  test("deployment belongs to a different org -> 403 cross_org", () => {
    const result = decideTier2Call(
      baseInput({ deploymentBuilderOrgId: OTHER_ORG_ID }),
    );
    assert.deepEqual(result, { ok: false, status: 403, reason: "cross_org" });
  });

  test("no stored voice key for the org -> 403 not_configured", () => {
    const result = decideTier2Call(baseInput({ storedKeyPresent: false }));
    assert.deepEqual(result, { ok: false, status: 403, reason: "not_configured" });
  });
});

describe("decideTier2Call — branch ORDER", () => {
  // Signature verification must be checked FIRST, before anything about the
  // deployment/org/key is examined — an unauthenticated caller must never
  // learn (via a different status code) whether a deployment exists, whether
  // it's cross-org, or whether a key is configured. All of those would leak
  // through a 403/404 if checked before the signature.
  test("unverified + no deployment -> 401 (signature wins over no_deployment)", () => {
    const result = decideTier2Call(
      baseInput({ verified: false, deploymentBuilderOrgId: null }),
    );
    assert.deepEqual(result, { ok: false, status: 401, reason: "bad_signature" });
  });

  test("unverified + cross-org -> 401 (signature wins over cross_org)", () => {
    const result = decideTier2Call(
      baseInput({ verified: false, deploymentBuilderOrgId: OTHER_ORG_ID }),
    );
    assert.deepEqual(result, { ok: false, status: 401, reason: "bad_signature" });
  });

  test("unverified + no stored key -> 401 (signature wins over not_configured)", () => {
    const result = decideTier2Call(
      baseInput({ verified: false, storedKeyPresent: false }),
    );
    assert.deepEqual(result, { ok: false, status: 401, reason: "bad_signature" });
  });

  // Deployment resolution is checked SECOND — before the org-match and
  // key-presence checks. A verified caller with no matching deployment must
  // get 404 even if (hypothetically) an org id happens to mismatch or no key
  // is configured — the deployment lookup is the more fundamental fact.
  test("verified + no deployment + no stored key -> 404 (deployment wins over not_configured)", () => {
    const result = decideTier2Call(
      baseInput({ deploymentBuilderOrgId: null, storedKeyPresent: false }),
    );
    assert.deepEqual(result, { ok: false, status: 404, reason: "no_deployment" });
  });

  test("verified + no deployment + cross-org-shaped input -> 404 (deployment wins over cross_org)", () => {
    // deploymentBuilderOrgId is null here (not resolved), so there is no
    // "other org" to compare against — the null check must fire before any
    // org-equality comparison would even be meaningful.
    const result = decideTier2Call(
      baseInput({ deploymentBuilderOrgId: null }),
    );
    assert.deepEqual(result, { ok: false, status: 404, reason: "no_deployment" });
  });

  // Org match is checked THIRD — before key presence. A cross-org deployment
  // must be rejected even when the org happens to have a key stored (that
  // key belongs to the WRONG org's call, not this one).
  test("cross-org + no stored key -> 403 cross_org (org-match wins over not_configured)", () => {
    const result = decideTier2Call(
      baseInput({ deploymentBuilderOrgId: OTHER_ORG_ID, storedKeyPresent: false }),
    );
    assert.deepEqual(result, { ok: false, status: 403, reason: "cross_org" });
  });
});
