// ============================================================================
// v1.19.0 — JWT self-healing recovery contract
// ============================================================================
//
// Bug class: token.sub in the JWT can drift away from the actual
// users.id row, producing the "signed in but locked in synthesized
// empty record" dead-state. The v1.7.3 synthesizer prevents the
// uncaught-throw crash but leaves the user with no orgId, no plan,
// every write 403s.
//
// v1.19 contract: when token.sub does NOT resolve to a users row,
// the JWT callback falls back to a lookup by lower(email). If a row
// with that email exists, token.sub is re-anchored to that user's
// id. If still no match, a structured warn is logged so production
// monitoring can surface the count of orphan tokens.
//
// What we unit-test here is the lookup-input normalization shape:
// the email used for recovery must match the email stored at signup
// (which goes through `data.email?.trim().toLowerCase()` in the
// adapter's createUser). Both sides must converge.

import { test } from "node:test";
import assert from "node:assert/strict";

// Mirrors the shape used by the JWT callback for recovery and the
// adapter for storage. Drift here = recovery silently misses.
function normalizeJwtEmail(rawEmail: unknown): string {
  if (typeof rawEmail !== "string") return "";
  return rawEmail.trim().toLowerCase();
}

test("normalizeJwtEmail produces lowercased trimmed output", () => {
  assert.equal(
    normalizeJwtEmail("MaxIME@Example.COM"),
    "maxime@example.com",
  );
  assert.equal(normalizeJwtEmail("  spaced@out.com  "), "spaced@out.com");
});

test("normalizeJwtEmail handles non-string defensively", () => {
  assert.equal(normalizeJwtEmail(null), "");
  assert.equal(normalizeJwtEmail(undefined), "");
  assert.equal(normalizeJwtEmail(42), "");
  assert.equal(normalizeJwtEmail({}), "");
});

test("recovery email matches createUser-stored email after normalization", () => {
  // createUser does: `data.email?.trim().toLowerCase()` and stores it.
  const storedAtSignup = "MaxIME@Example.COM".trim().toLowerCase();
  // JWT callback does: `token.email.trim().toLowerCase()` and looks it up.
  const recoveryLookup = normalizeJwtEmail("MaxIME@Example.COM");
  assert.equal(
    storedAtSignup,
    recoveryLookup,
    "stored email must equal the normalized lookup or recovery silently misses",
  );
});

test("recovery is idempotent — re-running on already-normalized email no-ops", () => {
  // Important because token.email might already be lowercased by NextAuth's
  // own normalization upstream. Calling our normalizer must not corrupt it.
  const once = normalizeJwtEmail("USER@DOMAIN.COM");
  const twice = normalizeJwtEmail(once);
  assert.equal(once, twice);
  assert.equal(once, "user@domain.com");
});

// ─── orphan-detection predicate ────────────────────────────────────────────
//
// A predicate that mirrors the JWT callback's branching: given a
// token.sub, a fetched-by-id row (or null), and an email-lookup row
// (or null), produce one of three outcomes:
//   - resolved:   token.sub was valid; use it
//   - self_healed: token.sub didn't resolve, but email did; re-anchor
//   - orphan:     neither resolved; leave token.sub as-is, log warning

type RecoveryOutcome = "resolved" | "self_healed" | "orphan";

function classifyJwtRecovery(
  byId: { id: string } | null,
  byEmail: { id: string } | null,
): RecoveryOutcome {
  if (byId) return "resolved";
  if (byEmail) return "self_healed";
  return "orphan";
}

test("classifyJwtRecovery: by-id match → resolved", () => {
  assert.equal(classifyJwtRecovery({ id: "u1" }, null), "resolved");
});

test("classifyJwtRecovery: by-id miss + by-email match → self_healed", () => {
  assert.equal(classifyJwtRecovery(null, { id: "u-new" }), "self_healed");
});

test("classifyJwtRecovery: both miss → orphan", () => {
  assert.equal(classifyJwtRecovery(null, null), "orphan");
});

test("classifyJwtRecovery: by-id wins even if by-email also resolves", () => {
  // If we have BOTH (rare), the original token.sub is still preferred.
  // This avoids unnecessary re-anchoring noise when the system is
  // working normally.
  assert.equal(
    classifyJwtRecovery({ id: "u-original" }, { id: "u-other" }),
    "resolved",
  );
});
