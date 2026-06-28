// Security — forms/submit cross-tenant write guard (FIX 3).
//
// The dangerous behavior was `const orgId = body.orgId || (await getOrgId())`
// on a PUBLIC route that then writes a contact + emits `lead.created` (which
// fires the org's speed-to-lead agent on its Twilio/Resend creds). An
// unauthenticated caller could pass ANY `body.orgId` and write into / bill
// another tenant.
//
// `resolveSubmitOrg` is the pure decision the route now uses: the authority is
// the VERIFIED host org (or an authenticated session org) — never a raw
// body.orgId. The "host resolver" is DI'd here by simply passing the org ids
// the route would have resolved (the route does host→slug→orgId and getOrgId()
// then hands the results to this function).
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/security/forms-submit-org.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveSubmitOrg } from "../../../src/lib/forms/resolve-submit-org";

const HOST_ORG = "org-host-1111";
const OTHER_ORG = "org-attacker-9999";
const SESSION_ORG = "org-session-2222";

describe("resolveSubmitOrg — the attack: body.orgId not matching the verified host", () => {
  test("anon request, host resolves to org A, body.orgId = org B → REJECT (org_mismatch)", () => {
    const r = resolveSubmitOrg({
      hostOrgId: HOST_ORG,
      sessionOrgId: null,
      bodyOrgId: OTHER_ORG,
    });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "org_mismatch");
  });

  test("anon request, NO verified host, body.orgId supplied → REJECT (no_verified_org)", () => {
    // This is the raw exploit: unauthenticated, on a non-workspace host,
    // trusting a body-supplied org. Must never write/emit.
    const r = resolveSubmitOrg({
      hostOrgId: null,
      sessionOrgId: null,
      bodyOrgId: OTHER_ORG,
    });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "no_verified_org");
  });

  test("anon request, NO verified host, NO body.orgId → REJECT (no_verified_org)", () => {
    const r = resolveSubmitOrg({ hostOrgId: null, sessionOrgId: null, bodyOrgId: null });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "no_verified_org");
  });
});

describe("resolveSubmitOrg — legit flows keep working", () => {
  test("public landing form on <slug>.app — host org A, body.orgId = org A → OK, scoped to A (host)", () => {
    // The Puck FormContainer posts body.orgId = puck.metadata.orgId, which
    // equals the org the subdomain resolves to. Must succeed.
    const r = resolveSubmitOrg({
      hostOrgId: HOST_ORG,
      sessionOrgId: null,
      bodyOrgId: HOST_ORG,
    });
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.orgId, HOST_ORG);
    assert.equal(r.ok === true && r.source, "host");
  });

  test("public landing form, host org A, body.orgId omitted → OK, scoped to host A", () => {
    const r = resolveSubmitOrg({ hostOrgId: HOST_ORG, sessionOrgId: null, bodyOrgId: null });
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.orgId, HOST_ORG);
    assert.equal(r.ok === true && r.source, "host");
  });

  test("operator editor preview (authenticated, bare app host) — session org, body = session org → OK (session)", () => {
    // In-dashboard preview is served on the bare app domain (no host org)
    // but is an authenticated operator request; getOrgId() resolves their org.
    const r = resolveSubmitOrg({
      hostOrgId: null,
      sessionOrgId: SESSION_ORG,
      bodyOrgId: SESSION_ORG,
    });
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.orgId, SESSION_ORG);
    assert.equal(r.ok === true && r.source, "session");
  });

  test("operator editor preview, session org, NO body.orgId → OK (session)", () => {
    const r = resolveSubmitOrg({ hostOrgId: null, sessionOrgId: SESSION_ORG, bodyOrgId: null });
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.orgId, SESSION_ORG);
  });
});

describe("resolveSubmitOrg — host wins over session; mismatches rejected", () => {
  test("host org A present AND session org B present → authority is HOST (A)", () => {
    const r = resolveSubmitOrg({
      hostOrgId: HOST_ORG,
      sessionOrgId: SESSION_ORG,
      bodyOrgId: HOST_ORG,
    });
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.orgId, HOST_ORG);
    assert.equal(r.ok === true && r.source, "host");
  });

  test("authenticated operator tries to target another org via body.orgId → REJECT", () => {
    // Even an authenticated session can't write to an org it isn't scoped to
    // by passing a different body.orgId.
    const r = resolveSubmitOrg({
      hostOrgId: null,
      sessionOrgId: SESSION_ORG,
      bodyOrgId: OTHER_ORG,
    });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "org_mismatch");
  });

  test("whitespace-only body.orgId is treated as absent (no spurious mismatch)", () => {
    const r = resolveSubmitOrg({ hostOrgId: HOST_ORG, sessionOrgId: null, bodyOrgId: "   " });
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.orgId, HOST_ORG);
  });
});
