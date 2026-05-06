// ============================================================================
// v1.20.0 — operator-portal token contract tests
// ============================================================================
//
// The operator-portal auth flow uses HMAC-signed JWT-style tokens
// for both magic-link issuance and session cookies. Two distinct
// token kinds share the same envelope, discriminated by `kind`.
//
// Bug class these tests prevent: a magic-link token (15-min TTL)
// being mistakenly accepted as a session token (7-day TTL),
// effectively extending the magic-link's lifetime to 7 days. The
// kind discriminator must be enforced at verify time.
//
// What we unit-test here are the PURE token primitives. The
// DB-loading consumer functions (consumeOperatorMagicLink,
// requireOperatorSessionForOrg) sit on top and are integration-test
// territory.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  signOperatorToken,
  verifyOperatorToken,
  type OperatorTokenPayload,
} from "../../src/lib/operator-portal/session";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const EMAIL = "owner@cypress-pine-hvac.com";

function inFutureMs(minutes: number): number {
  return Date.now() + minutes * 60_000;
}

function inPastMs(minutes: number): number {
  return Date.now() - minutes * 60_000;
}

test("signed magic token round-trips through verify", () => {
  const payload: OperatorTokenPayload = {
    orgId: ORG_ID,
    email: EMAIL,
    exp: inFutureMs(15),
    kind: "magic",
  };
  const token = signOperatorToken(payload);
  const verified = verifyOperatorToken(token);
  assert.ok(verified);
  assert.equal(verified.orgId, ORG_ID);
  assert.equal(verified.email, EMAIL);
  assert.equal(verified.kind, "magic");
});

test("signed session token round-trips through verify", () => {
  const payload: OperatorTokenPayload = {
    orgId: ORG_ID,
    email: EMAIL,
    exp: inFutureMs(7 * 24 * 60),
    kind: "session",
  };
  const token = signOperatorToken(payload);
  const verified = verifyOperatorToken(token);
  assert.ok(verified);
  assert.equal(verified.kind, "session");
});

test("expired token rejected at verify", () => {
  const expired = signOperatorToken({
    orgId: ORG_ID,
    email: EMAIL,
    exp: inPastMs(1),
    kind: "session",
  });
  assert.equal(verifyOperatorToken(expired), null);
});

test("tampered payload rejected (signature mismatch)", () => {
  const original = signOperatorToken({
    orgId: ORG_ID,
    email: EMAIL,
    exp: inFutureMs(15),
    kind: "magic",
  });
  const [, signature] = original.split(".");
  // Replace the body with a forged one (different orgId) but keep
  // the original signature. Verify must reject.
  const forgedBody = Buffer.from(
    JSON.stringify({
      orgId: "22222222-2222-2222-2222-222222222222",
      email: EMAIL,
      exp: inFutureMs(15),
      kind: "magic",
    }),
    "utf-8",
  ).toString("base64url");
  const forged = `${forgedBody}.${signature}`;
  assert.equal(verifyOperatorToken(forged), null);
});

test("malformed token (no dot separator) rejected", () => {
  assert.equal(verifyOperatorToken("nodothere"), null);
  assert.equal(verifyOperatorToken(""), null);
  assert.equal(verifyOperatorToken(null), null);
  assert.equal(verifyOperatorToken(undefined), null);
});

test("invalid kind rejected", () => {
  // Manually craft a payload with an invalid kind.
  const body = Buffer.from(
    JSON.stringify({
      orgId: ORG_ID,
      email: EMAIL,
      exp: inFutureMs(15),
      kind: "admin", // not a valid OperatorTokenKind
    }),
    "utf-8",
  ).toString("base64url");
  // This token has the right HMAC envelope but the wrong kind.
  // We need to actually sign it correctly for the signature to
  // match — re-using signOperatorToken via a typed-cast.
  const crafted = signOperatorToken({
    orgId: ORG_ID,
    email: EMAIL,
    exp: inFutureMs(15),
    // @ts-expect-error testing runtime defense against bad kind
    kind: "admin",
  });
  void body;
  assert.equal(verifyOperatorToken(crafted), null);
});

test("missing required field (orgId) rejected", () => {
  // Build a signed payload missing orgId. Sign it correctly so the
  // HMAC envelope passes; verify must still reject on shape.
  // Empty string passes the type check at compile time but verify
  // must reject it at runtime — orgId presence is shape-validated.
  const crafted = signOperatorToken({
    orgId: "",
    email: EMAIL,
    exp: inFutureMs(15),
    kind: "session",
  });
  assert.equal(verifyOperatorToken(crafted), null);
});

test("magic and session tokens are distinguishable by kind discriminator", () => {
  // The auth flow REQUIRES that magic-link tokens cannot be used as
  // session cookies (the magic-link route's atomic step is to
  // EXCHANGE the magic token for a session token). So verify must
  // surface the kind so callers can branch.
  const magic = signOperatorToken({
    orgId: ORG_ID,
    email: EMAIL,
    exp: inFutureMs(15),
    kind: "magic",
  });
  const session = signOperatorToken({
    orgId: ORG_ID,
    email: EMAIL,
    exp: inFutureMs(7 * 24 * 60),
    kind: "session",
  });
  assert.equal(verifyOperatorToken(magic)?.kind, "magic");
  assert.equal(verifyOperatorToken(session)?.kind, "session");
  assert.notEqual(
    verifyOperatorToken(magic)?.kind,
    verifyOperatorToken(session)?.kind,
    "kind discriminator must allow callers to refuse magic-as-session",
  );
});

test("supportOriginUserId carries through session tokens (v1.21 hook)", () => {
  // Agency support sessions: when an SF agency operator (Acme AI)
  // signs in to support their HVAC client, the token carries
  // supportOriginUserId so the operator portal can render the
  // "you are signed in as <email> on behalf of <agency>" banner.
  const token = signOperatorToken({
    orgId: ORG_ID,
    email: EMAIL,
    exp: inFutureMs(7 * 24 * 60),
    kind: "session",
    supportOriginUserId: "33333333-3333-3333-3333-333333333333",
  });
  const verified = verifyOperatorToken(token);
  assert.ok(verified);
  assert.equal(
    verified.supportOriginUserId,
    "33333333-3333-3333-3333-333333333333",
  );
});

test("normal sessions have null/undefined supportOriginUserId", () => {
  const token = signOperatorToken({
    orgId: ORG_ID,
    email: EMAIL,
    exp: inFutureMs(7 * 24 * 60),
    kind: "session",
  });
  const verified = verifyOperatorToken(token);
  assert.ok(verified);
  // Either null or undefined is fine — the layout's
  // `Boolean(session.supportOriginUserId)` check works for both.
  assert.equal(verified.supportOriginUserId ?? null, null);
});
