// Tier-2 (BYO OpenAI project) per-org voice webhook — the auth DECISION.
// Spec 2026-07-01-voice-deploy-metered-billing, Task 8.
//
// PURE — no DB, no crypto, no I/O. The route resolves the four inputs (verify
// the signature against the ORG's own whsec_, resolve the deployment by the
// dialed number, compare its builderOrgId to the :orgId route param, and
// check whether the org has a stored voice key) and hands them here for the
// single, exhaustively-tested decision. Keeping this pure is what makes the
// ORDER between checks trivially assertable (see tier2-auth.spec.ts) — a
// mistake here is the exact SECURITY-CRITICAL bug class this task exists to
// prevent (one org's OpenAI project driving another org's agent).
//
// ORDER (never reorder without re-reading the spec comment below — it is
// load-bearing):
//   1. signature verified?      -> 401 bad_signature
//   2. deployment resolved?     -> 404 no_deployment
//   3. deployment's builder org == the :orgId route param? -> 403 cross_org
//   4. org has a stored voice key? -> 403 not_configured
//   5. else                     -> ok
//
// WHY signature FIRST: an unauthenticated caller (wrong/missing/forged
// webhook-signature) must get the SAME 401 regardless of whether a
// deployment exists for the dialed number, whether it's cross-org, or
// whether a key is configured. Checking anything deployment-shaped before
// the signature would let an attacker distinguish "no deployment" (404) from
// "deployment exists, wrong org" (403) from "deployment exists, not
// configured" (403) WITHOUT ever proving they hold the org's webhook secret
// — an information leak about which orgs/numbers are live Tier-2 tenants.
//
// WHY deployment SECOND (before org-match/key-presence): a deployment must
// actually resolve before "does it belong to this org" or "is a key
// configured" are even meaningful questions to ask. This also means a
// verified-but-unmatched-number call always reads as 404 (a routing/config
// fact), never as 403 (an entitlement fact) — the two failure classes stay
// distinguishable in logs/metrics.
//
// WHY org-match THIRD (before key-presence): if the resolved deployment
// belongs to a DIFFERENT builder org than the one whose whsec_/route param
// this request came in on, that is a cross-tenant misrouting regardless of
// whether *a* key happens to be configured for this org — the org's own key
// is irrelevant to a call that isn't theirs. Checking key-presence first
// would leak "this org has 3rd-party voice configured" to a caller who
// hasn't even proven the deployment is theirs.

export type Tier2Decision =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 404; reason: string };

export function decideTier2Call(input: {
  /** The :orgId route param — the org whose whsec_ was used to verify. */
  orgId: string;
  /** Result of verifying the inbound webhook signature against THIS org's
   *  stored whsec_ (never the platform secret). */
  verified: boolean;
  /** The builder org id of the deployment resolved for the dialed number, or
   *  null when no active deployment matched (routing miss / wrong number). */
  deploymentBuilderOrgId: string | null;
  /** Whether this org has a stored Tier-2 OpenAI voice API key. */
  storedKeyPresent: boolean;
}): Tier2Decision {
  if (!input.verified) {
    return { ok: false, status: 401, reason: "bad_signature" };
  }

  if (input.deploymentBuilderOrgId === null) {
    return { ok: false, status: 404, reason: "no_deployment" };
  }

  if (input.deploymentBuilderOrgId !== input.orgId) {
    return { ok: false, status: 403, reason: "cross_org" };
  }

  if (!input.storedKeyPresent) {
    return { ok: false, status: 403, reason: "not_configured" };
  }

  return { ok: true };
}
