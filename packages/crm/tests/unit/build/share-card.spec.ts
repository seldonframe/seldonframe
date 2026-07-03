// Unit tests for buildShareCard — the deploy share-card growth loop (virality
// pack, Task 2). PURE function (no DB/network); pins:
//   - minutes clamp 1..120 from startedAt→now
//   - null startedAt → "under an hour" phrasing (no minutes clause)
//   - businessName is URL-encoded into BOTH cardUrl and postUrl — never
//     interpolated raw (query params are attacker-controlled downstream, see
//     the OG route's own sanitization; this spec pins the encoding contract
//     the OG route depends on)
//   - postUrl is an x.com/intent/post URL whose `text` param, once decoded,
//     is byte-identical to `text` + the card link
//
// Same convention as powered-by-badge.spec.ts / wallet-format.spec.ts:
// node:test + node:assert/strict, relative import, no framework.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildShareCard } from "../../../src/lib/build/share-card";

describe("buildShareCard — minutes clamp", () => {
  test("computes whole minutes elapsed between startedAt and now", () => {
    const startedAt = new Date("2026-07-02T10:00:00.000Z");
    const now = new Date("2026-07-02T10:07:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "voice" });
    assert.match(result.text, /in 7 minutes/);
  });

  test("clamps below 1 minute up to 1 (e.g. 0s or negative elapsed)", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAtSameInstant = new Date("2026-07-02T10:00:00.000Z");
    const result = buildShareCard({
      businessName: "Acme Plumbing",
      startedAt: startedAtSameInstant,
      now,
      kind: "chat",
    });
    assert.match(result.text, /in 1 minutes/);
  });

  test("clamps negative elapsed (startedAt after now) up to 1", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAtInFuture = new Date("2026-07-02T10:05:00.000Z");
    const result = buildShareCard({
      businessName: "Acme Plumbing",
      startedAt: startedAtInFuture,
      now,
      kind: "chat",
    });
    assert.match(result.text, /in 1 minutes/);
  });

  test("clamps above 120 minutes down to 120", () => {
    const startedAt = new Date("2026-07-02T08:00:00.000Z");
    const now = new Date("2026-07-02T12:00:00.000Z"); // 240 min elapsed
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "voice" });
    assert.match(result.text, /in 120 minutes/);
  });

  test("exactly 120 minutes stays at 120 (boundary, not clamped down further)", () => {
    const startedAt = new Date("2026-07-02T08:00:00.000Z");
    const now = new Date("2026-07-02T10:00:00.000Z"); // exactly 120 min
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "voice" });
    assert.match(result.text, /in 120 minutes/);
  });

  test("exactly 1 minute stays at 1 (boundary, not clamped up further)", () => {
    const startedAt = new Date("2026-07-02T10:00:00.000Z");
    const now = new Date("2026-07-02T10:01:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "voice" });
    assert.match(result.text, /in 1 minutes/);
  });
});

describe("buildShareCard — null startedAt fallback", () => {
  test("null startedAt produces 'under an hour' phrasing, no minutes clause", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt: null, now, kind: "voice" });
    assert.match(result.text, /under an hour/);
    assert.doesNotMatch(result.text, /in \d+ minutes/);
  });

  test("null startedAt still names the business and kind correctly", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt: null, now, kind: "chat" });
    assert.match(result.text, /Acme Plumbing/);
    assert.match(result.text, /agent/);
    assert.doesNotMatch(result.text, /phone receptionist/);
  });
});

describe("buildShareCard — text copy per kind", () => {
  test("kind voice -> 'phone receptionist' wording", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "voice" });
    assert.match(result.text, /Shipped a 24\/7 AI phone receptionist for Acme Plumbing in 5 minutes — from my IDE\. Built on @seldonframe\./);
  });

  test("kind chat -> 'agent' wording", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "chat" });
    assert.match(result.text, /Shipped a 24\/7 AI agent for Acme Plumbing in 5 minutes — from my IDE\. Built on @seldonframe\./);
  });

  test("kind workspace -> 'agent' wording (non-voice default)", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "workspace" });
    assert.match(result.text, /Shipped a 24\/7 AI agent for Acme Plumbing in 5 minutes — from my IDE\. Built on @seldonframe\./);
  });
});

describe("buildShareCard — cardUrl", () => {
  test("cardUrl points at the OG route with name/mins/kind query params", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "voice" });
    const url = new URL(result.cardUrl);
    assert.equal(url.pathname, "/api/og/shipped");
    assert.equal(url.searchParams.get("name"), "Acme Plumbing");
    assert.equal(url.searchParams.get("mins"), "5");
    assert.equal(url.searchParams.get("kind"), "voice");
  });

  test("cardUrl URL-encodes a businessName with an ampersand and other special chars", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({
      businessName: "Bob & Sons Plumbing / Repair?",
      startedAt,
      now,
      kind: "voice",
    });
    // Raw ampersand must never appear un-encoded inside the query string
    // portion of the URL (that would break query param parsing).
    const queryString = result.cardUrl.split("?")[1] ?? "";
    assert.doesNotMatch(queryString, /name=Bob & Sons/);
    // Round-trip via URLSearchParams recovers the exact original string.
    const url = new URL(result.cardUrl);
    assert.equal(url.searchParams.get("name"), "Bob & Sons Plumbing / Repair?");
  });

  test("cardUrl uses NEXT_PUBLIC_APP_URL as the base when set", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.seldonframe.com";
    try {
      const now = new Date("2026-07-02T10:00:00.000Z");
      const result = buildShareCard({
        businessName: "Acme Plumbing",
        startedAt: null,
        now,
        kind: "voice",
      });
      assert.ok(result.cardUrl.startsWith("https://staging.seldonframe.com/api/og/shipped"));
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prev;
    }
  });

  test("cardUrl falls back to https://app.seldonframe.com when NEXT_PUBLIC_APP_URL is unset", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    try {
      const now = new Date("2026-07-02T10:00:00.000Z");
      const result = buildShareCard({
        businessName: "Acme Plumbing",
        startedAt: null,
        now,
        kind: "voice",
      });
      assert.ok(result.cardUrl.startsWith("https://app.seldonframe.com/api/og/shipped"));
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prev;
    }
  });
});

describe("buildShareCard — postUrl (x.com intent)", () => {
  test("postUrl is an x.com/intent/post URL", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "voice" });
    const url = new URL(result.postUrl);
    assert.equal(url.origin, "https://x.com");
    assert.equal(url.pathname, "/intent/post");
  });

  test("postUrl's decoded text param equals text + the card link (no drift)", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt, now, kind: "voice" });
    const url = new URL(result.postUrl);
    const decodedText = url.searchParams.get("text");
    assert.ok(decodedText, "expected a text param");
    assert.ok(decodedText!.startsWith(result.text), "text param must start with the exact share text");
    assert.ok(decodedText!.includes(result.cardUrl), "text param must include the card link");
  });

  test("no unencoded businessName appears anywhere in the raw postUrl string when it contains an ampersand", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({
      businessName: "Bob & Sons Plumbing",
      startedAt,
      now,
      kind: "voice",
    });
    // The raw businessName ("Bob & Sons Plumbing") must never appear
    // verbatim in the postUrl string — everything must be percent-encoded
    // (the raw `&` would otherwise be misparsed as a query-param separator).
    assert.doesNotMatch(result.postUrl, /Bob & Sons Plumbing/);
    // But it must be present in encoded form, recoverable by decoding.
    const url = new URL(result.postUrl);
    const decodedText = url.searchParams.get("text") ?? "";
    assert.match(decodedText, /Bob & Sons Plumbing/);
  });

  test("postUrl round-trips a businessName containing '?' and '/' safely", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const startedAt = new Date("2026-07-02T09:55:00.000Z");
    const result = buildShareCard({
      businessName: "Repair & Go?/Fast",
      startedAt,
      now,
      kind: "chat",
    });
    const url = new URL(result.postUrl);
    const decodedText = url.searchParams.get("text") ?? "";
    assert.match(decodedText, /Repair & Go\?\/Fast/);
  });
});

describe("buildShareCard — return shape", () => {
  test("returns exactly { cardUrl, text, postUrl }", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const result = buildShareCard({ businessName: "Acme Plumbing", startedAt: null, now, kind: "voice" });
    assert.deepEqual(Object.keys(result).sort(), ["cardUrl", "postUrl", "text"]);
    assert.equal(typeof result.cardUrl, "string");
    assert.equal(typeof result.text, "string");
    assert.equal(typeof result.postUrl, "string");
  });
});
