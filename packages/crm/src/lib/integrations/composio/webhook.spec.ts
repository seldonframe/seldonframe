// TDD for the pure Composio webhook helpers: HMAC signature verification + the
// V3 payload → SeldonEvent mapping. These run BEFORE the route exists (the route
// is thin glue over these). No network, no env.
//
// Signature recipe (locked, per the integration plan + Composio docs):
//   signing string = `${id}.${timestamp}.${rawBody}`
//   HMAC-SHA256(secret, signingString) → base64
//   received header may be space-separated multi-sig; each part maybe `v1,<b64>`
//     → take the part after the comma; constant-time compare any match
//   reject if |now - Number(timestamp)*1000| > 300_000 (5-min tolerance)

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { verifyComposioSignature, composioEventToSeldon, slugToType } from "./webhook";

const SECRET = "whsec_test_secret";

/** Build a valid Composio-style base64 HMAC for the given parts. */
function sign(id: string, timestamp: string, rawBody: string, secret = SECRET): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
}

const NOW = 1_700_000_000_000; // fixed "now" in ms
const TS = String(Math.floor(NOW / 1000)); // matching unix-seconds timestamp

// ─── verifyComposioSignature ─────────────────────────────────────────────────

test("accepts a valid signature within the time window", () => {
  const id = "evt_1";
  const rawBody = JSON.stringify({ hello: "world" });
  const sig = sign(id, TS, rawBody);
  assert.equal(
    verifyComposioSignature({ id, timestamp: TS, rawBody, signatureHeader: sig, secret: SECRET, now: NOW }),
    true,
  );
});

test("accepts a `v1,<b64>` prefixed signature (strips the scheme prefix)", () => {
  const id = "evt_2";
  const rawBody = "{}";
  const sig = sign(id, TS, rawBody);
  assert.equal(
    verifyComposioSignature({
      id,
      timestamp: TS,
      rawBody,
      signatureHeader: `v1,${sig}`,
      secret: SECRET,
      now: NOW,
    }),
    true,
  );
});

test("accepts when one of several space-separated signatures matches", () => {
  const id = "evt_3";
  const rawBody = "{}";
  const good = sign(id, TS, rawBody);
  const header = `v1,AAAAbogus== v1,${good}`;
  assert.equal(
    verifyComposioSignature({ id, timestamp: TS, rawBody, signatureHeader: header, secret: SECRET, now: NOW }),
    true,
  );
});

test("rejects a tampered body (signature no longer matches)", () => {
  const id = "evt_4";
  const rawBody = JSON.stringify({ amount: 1 });
  const sig = sign(id, TS, rawBody);
  const tampered = JSON.stringify({ amount: 1000 });
  assert.equal(
    verifyComposioSignature({ id, timestamp: TS, rawBody: tampered, signatureHeader: sig, secret: SECRET, now: NOW }),
    false,
  );
});

test("rejects a signature signed with the wrong secret", () => {
  const id = "evt_5";
  const rawBody = "{}";
  const sig = sign(id, TS, rawBody, "the_wrong_secret");
  assert.equal(
    verifyComposioSignature({ id, timestamp: TS, rawBody, signatureHeader: sig, secret: SECRET, now: NOW }),
    false,
  );
});

test("rejects an expired timestamp (> 5 min skew)", () => {
  const id = "evt_6";
  const rawBody = "{}";
  const oldTs = String(Math.floor((NOW - 6 * 60 * 1000) / 1000)); // 6 min ago
  const sig = sign(id, oldTs, rawBody);
  assert.equal(
    verifyComposioSignature({ id, timestamp: oldTs, rawBody, signatureHeader: sig, secret: SECRET, now: NOW }),
    false,
  );
});

test("rejects a future timestamp beyond the window", () => {
  const id = "evt_7";
  const rawBody = "{}";
  const futureTs = String(Math.floor((NOW + 6 * 60 * 1000) / 1000));
  const sig = sign(id, futureTs, rawBody);
  assert.equal(
    verifyComposioSignature({ id, timestamp: futureTs, rawBody, signatureHeader: sig, secret: SECRET, now: NOW }),
    false,
  );
});

test("accepts a timestamp just inside the window (4 min skew)", () => {
  const id = "evt_8";
  const rawBody = "{}";
  const ts = String(Math.floor((NOW - 4 * 60 * 1000) / 1000));
  const sig = sign(id, ts, rawBody);
  assert.equal(
    verifyComposioSignature({ id, timestamp: ts, rawBody, signatureHeader: sig, secret: SECRET, now: NOW }),
    true,
  );
});

test("rejects an empty / missing signature header", () => {
  const id = "evt_9";
  const rawBody = "{}";
  assert.equal(
    verifyComposioSignature({ id, timestamp: TS, rawBody, signatureHeader: "", secret: SECRET, now: NOW }),
    false,
  );
});

// ─── slugToType ──────────────────────────────────────────────────────────────

test("slugToType maps the pinned Gmail trigger to gmail.new_message (dedupes toolkit prefix)", () => {
  assert.equal(slugToType("GMAIL_NEW_GMAIL_MESSAGE"), "gmail.new_message");
});

test("slugToType lowercases + keeps the toolkit as the namespace", () => {
  assert.equal(slugToType("SLACK_RECEIVE_MESSAGE"), "slack.receive_message");
  assert.equal(slugToType("GOOGLECALENDAR_EVENT_CREATED"), "googlecalendar.event_created");
});

test("slugToType handles a single-token slug gracefully", () => {
  assert.equal(slugToType("GMAIL"), "gmail");
});

// ─── composioEventToSeldon ───────────────────────────────────────────────────

test("maps a V3 trigger payload: user_id→orgId, slug→type, data preserved + _composio meta", () => {
  const payload = {
    id: "evt_x",
    type: "composio.trigger.message",
    timestamp: TS,
    metadata: {
      user_id: "org-123",
      trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
      trigger_id: "trg_1",
      connected_account_id: "ca_9",
    },
    data: { subject: "Hello", from: "a@b.com" },
  };
  const out = composioEventToSeldon(payload);
  assert.ok(out);
  assert.equal(out!.orgId, "org-123");
  assert.equal(out!.type, "composio.gmail.new_message");
  assert.equal((out!.data as Record<string, unknown>).subject, "Hello");
  const meta = (out!.data as Record<string, unknown>)._composio as Record<string, unknown>;
  assert.equal(meta.triggerSlug, "GMAIL_NEW_GMAIL_MESSAGE");
  assert.equal(meta.connectedAccountId, "ca_9");
  // orgId is mirrored into the data so in-memory bus listeners can route it.
  assert.equal(meta.orgId, "org-123");
});

test("composioEventToSeldon returns null when user_id is missing (can't route)", () => {
  const out = composioEventToSeldon({
    metadata: { trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE" },
    data: {},
  } as unknown as Parameters<typeof composioEventToSeldon>[0]);
  assert.equal(out, null);
});

test("composioEventToSeldon returns null when trigger_slug is missing", () => {
  const out = composioEventToSeldon({
    metadata: { user_id: "org-1" },
    data: {},
  } as unknown as Parameters<typeof composioEventToSeldon>[0]);
  assert.equal(out, null);
});

test("composioEventToSeldon tolerates empty data (defaults to {})", () => {
  const out = composioEventToSeldon({
    metadata: { user_id: "org-1", trigger_slug: "SLACK_RECEIVE_MESSAGE", connected_account_id: "ca_1" },
  } as unknown as Parameters<typeof composioEventToSeldon>[0]);
  assert.ok(out);
  assert.equal(out!.type, "composio.slack.receive_message");
  assert.equal(typeof out!.data, "object");
});
