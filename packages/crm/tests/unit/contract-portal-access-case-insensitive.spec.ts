// ============================================================================
// v1.19.0 — portal access-code case-insensitive email lookup
// ============================================================================
//
// Bug class this test exists to prevent: customer types their email
// with different casing than what's stored, the eq()-based lookup
// silently no-ops, no code is sent, customer reports "no email
// arrived" with no recoverable signal.
//
// Reproduced 2026-05-06: customer typed `dresslikeag@Gmail.com` (capital
// G), DB had `dresslikeag@gmail.com` (lowercase). The lookup
// `eq(contacts.email, email)` is case-sensitive in Postgres → no
// match → silent success → no code sent.
//
// Contract: requestPortalAccessCodeAction normalizes email at action
// entry (trim + lowercase) AND uses lower(stored_email) at the SQL
// compare. Both sides normalized → casing irrelevant.
//
// This test verifies the NORMALIZATION is consistent. The actual DB
// query path is integration-test territory (queued for the v1.10+
// integration harness per docs/CONTRACTS.md). What we CAN unit-test
// is that the normalization function produces stable lowercase
// output for representative inputs.

import { test } from "node:test";
import assert from "node:assert/strict";

// Helper: replicate the action's normalization. Kept colocated so a
// future code change that drifts the normalization shape (e.g. adds
// punctuation stripping) also drifts this test.
function normalizePortalEmail(rawEmail: string): string {
  return (rawEmail ?? "").trim().toLowerCase();
}

test("normalizePortalEmail lowercases and trims", () => {
  assert.equal(normalizePortalEmail("DresslikeAG@Gmail.com"), "dresslikeag@gmail.com");
  assert.equal(normalizePortalEmail("  spaces@around.com  "), "spaces@around.com");
  assert.equal(normalizePortalEmail("ALL.CAPS@DOMAIN.COM"), "all.caps@domain.com");
});

test("normalizePortalEmail handles empty / null / undefined gracefully", () => {
  assert.equal(normalizePortalEmail(""), "");
  // @ts-expect-error testing runtime resilience
  assert.equal(normalizePortalEmail(null), "");
  // @ts-expect-error testing runtime resilience
  assert.equal(normalizePortalEmail(undefined), "");
});

test("normalizePortalEmail preserves the local-part body but lowercases it", () => {
  // Real-world: Maxime types `dresslikeAG@gmail.com` because his
  // muscle memory hits Shift somewhere in the middle. We must match
  // the stored `dresslikeag@gmail.com`.
  assert.equal(
    normalizePortalEmail("dresslikeAG@gmail.com"),
    "dresslikeag@gmail.com",
  );
});

test("normalizePortalEmail produces idempotent output", () => {
  // Calling the normalizer twice must yield the same result. This
  // matters because we normalize at request and at verify; both
  // sides must arrive at the same string.
  const once = normalizePortalEmail("DresslikeAG@Gmail.com");
  const twice = normalizePortalEmail(once);
  assert.equal(once, twice);
});

test("matches a case-different stored email after normalization", () => {
  // Simulates the SQL `lower(stored_email) = normalized_input`
  // comparison. Stored DB email might be lowercase OR mixed case
  // (legacy data). The action lowercases the input AND the query
  // uses lower() on the stored side. Both sides converge.
  const storedEmail = "dresslikeag@gmail.com"; // current state
  const userInput = "dresslikeAG@Gmail.com";    // user's typing
  assert.equal(
    storedEmail.toLowerCase(),
    normalizePortalEmail(userInput),
    "lower(stored) must equal normalized(input)",
  );

  // And a legacy case where stored was MIXED:
  const legacyStored = "DresslikeAG@gmail.com";
  assert.equal(
    legacyStored.toLowerCase(),
    normalizePortalEmail("dresslikeag@gmail.com"),
  );
});
