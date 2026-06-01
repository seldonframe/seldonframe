// Unit tests for the OpenAI Realtime webhook signature verifier (Standard
// Webhooks / Svix scheme). No network, no SDK — we synthesize a signed payload
// with the SAME helper the verifier exposes (computeSignature) so the fixture
// is provably correct, then assert valid passes and every tampered/unsigned/
// expired variant fails with the right reason.
//
// Follows the repo's node:test + node:assert/strict convention (see
// realtime-tools.spec.ts). No mocking — verification is a pure function over
// (payload, headers, secret, nowSeconds), so we drive it directly.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  verifyOpenAiWebhook,
  computeSignature,
  extractWebhookHeaders,
  WEBHOOK_TOLERANCE_SECONDS,
  type WebhookHeaders,
} from "../../../../src/lib/agents/voice/openai-webhook-verify";

// A `whsec_`-prefixed base64 secret, exactly the dashboard format.
const SECRET = "whsec_c2VsZG9uZnJhbWVfdGVzdF9zZWNyZXRfMTIzNDU2Nzg5MA==";

// A representative realtime.call.incoming body. The verifier is body-agnostic
// (it HMACs the raw string), but using a realistic payload documents intent.
const BODY = JSON.stringify({
  object: "event",
  id: "evt_685343a1381c819085d44c354e1b330e",
  type: "realtime.call.incoming",
  created_at: 1750287018,
  data: {
    call_id: "rtc_test_call_0001",
    sip_headers: [
      { name: "From", value: "sip:+14255551212@sip.example.com" },
      { name: "To", value: "sip:+18005551212@sip.example.com" },
    ],
  },
});

const WEBHOOK_ID = "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W";
// A fixed "now" the tests pin the clock to, plus a timestamp inside tolerance.
const NOW = 1750287100;
const TIMESTAMP = String(1750287080); // 20s before NOW — well within tolerance

/** Build the three headers for a correctly-signed request. */
function signedHeaders(overrides: Partial<WebhookHeaders> = {}): WebhookHeaders {
  const sig = computeSignature({ secret: SECRET, id: WEBHOOK_ID, timestamp: TIMESTAMP, body: BODY });
  return {
    id: WEBHOOK_ID,
    timestamp: TIMESTAMP,
    signature: `v1,${sig}`,
    ...overrides,
  };
}

describe("verifyOpenAiWebhook — valid signature", () => {
  test("a correctly signed payload verifies ok", () => {
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders(),
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, true);
  });

  test("verifies when the signature header carries multiple v1 entries (key rotation)", () => {
    const good = computeSignature({ secret: SECRET, id: WEBHOOK_ID, timestamp: TIMESTAMP, body: BODY });
    // Standard Webhooks allows a space-delimited list; an old key's sig sits
    // alongside the current one during rotation. Only one needs to match.
    const headers = signedHeaders({ signature: `v1,AAAAstaleHMACvalueBBBB== v1,${good}` });
    const result = verifyOpenAiWebhook({ payload: BODY, headers, secret: SECRET, nowSeconds: NOW });
    assert.equal(result.ok, true);
  });
});

describe("verifyOpenAiWebhook — unsigned / missing", () => {
  test("missing signature header → missing_headers", () => {
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders({ signature: null }),
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_headers");
  });

  test("missing webhook-id → missing_headers", () => {
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders({ id: null }),
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_headers");
  });

  test("no secret configured → missing_secret (distinct from a bad signature)", () => {
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders(),
      secret: undefined,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_secret");
  });

  test("empty-string secret → missing_secret", () => {
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders(),
      secret: "   ",
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_secret");
  });
});

describe("verifyOpenAiWebhook — tampering", () => {
  test("tampered body (same signature) → signature_mismatch", () => {
    // Caller flips one byte of the payload after it was signed.
    const tampered = BODY.replace("rtc_test_call_0001", "rtc_evil_call_9999");
    const result = verifyOpenAiWebhook({
      payload: tampered,
      headers: signedHeaders(),
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "signature_mismatch");
  });

  test("signature computed with the WRONG secret → signature_mismatch", () => {
    const forged = createHmac("sha256", Buffer.from("d3Jvbmdfa2V5", "base64"))
      .update(`${WEBHOOK_ID}.${TIMESTAMP}.${BODY}`, "utf8")
      .digest("base64");
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders({ signature: `v1,${forged}` }),
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "signature_mismatch");
  });

  test("garbage signature value → signature_mismatch", () => {
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders({ signature: "v1,not-a-real-signature" }),
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "signature_mismatch");
  });

  test("signature over a DIFFERENT timestamp than the header → signature_mismatch", () => {
    // Replay-ish: attacker reuses a valid body+sig but rewrites the timestamp
    // header to pass the freshness window. The HMAC no longer matches because
    // the timestamp is part of the signed content.
    const staleSig = computeSignature({ secret: SECRET, id: WEBHOOK_ID, timestamp: "1750280000", body: BODY });
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders({ signature: `v1,${staleSig}` }), // header timestamp is TIMESTAMP, sig is for an older one
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "signature_mismatch");
  });
});

describe("verifyOpenAiWebhook — replay window", () => {
  test("timestamp older than tolerance → timestamp_out_of_tolerance", () => {
    const oldTs = String(NOW - WEBHOOK_TOLERANCE_SECONDS - 60);
    const sig = computeSignature({ secret: SECRET, id: WEBHOOK_ID, timestamp: oldTs, body: BODY });
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: { id: WEBHOOK_ID, timestamp: oldTs, signature: `v1,${sig}` },
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "timestamp_out_of_tolerance");
  });

  test("timestamp far in the future → timestamp_out_of_tolerance", () => {
    const futureTs = String(NOW + WEBHOOK_TOLERANCE_SECONDS + 60);
    const sig = computeSignature({ secret: SECRET, id: WEBHOOK_ID, timestamp: futureTs, body: BODY });
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: { id: WEBHOOK_ID, timestamp: futureTs, signature: `v1,${sig}` },
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "timestamp_out_of_tolerance");
  });

  test("non-numeric timestamp → bad_timestamp", () => {
    const result = verifyOpenAiWebhook({
      payload: BODY,
      headers: signedHeaders({ timestamp: "not-a-number" }),
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "bad_timestamp");
  });
});

describe("extractWebhookHeaders", () => {
  test("pulls the three webhook-* headers from a Fetch Headers object (case-insensitive)", () => {
    const h = new Headers();
    h.set("Webhook-Id", "msg_abc");
    h.set("Webhook-Timestamp", "1750287080");
    h.set("Webhook-Signature", "v1,deadbeef");
    const extracted = extractWebhookHeaders(h);
    assert.equal(extracted.id, "msg_abc");
    assert.equal(extracted.timestamp, "1750287080");
    assert.equal(extracted.signature, "v1,deadbeef");
  });

  test("missing headers come back as null", () => {
    const extracted = extractWebhookHeaders(new Headers());
    assert.equal(extracted.id, null);
    assert.equal(extracted.timestamp, null);
    assert.equal(extracted.signature, null);
  });
});

describe("computeSignature — scheme", () => {
  test("signs `${id}.${timestamp}.${body}` with HMAC-SHA256 over the base64-decoded secret", () => {
    // Recompute independently to prove the exact scheme (no hidden transforms).
    const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
    const expected = createHmac("sha256", key)
      .update(`${WEBHOOK_ID}.${TIMESTAMP}.${BODY}`, "utf8")
      .digest("base64");
    const actual = computeSignature({ secret: SECRET, id: WEBHOOK_ID, timestamp: TIMESTAMP, body: BODY });
    assert.equal(actual, expected);
  });
});
