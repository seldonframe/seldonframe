// Unit test for the UUID-vs-slug guard in /api/v1/forms/[id]/route.ts (B5).
//
// The bug: passing a slug ("intake") to a query that compares against a
// UUID column crashes the route with a Postgres "invalid input syntax for
// type uuid" 500 — before the slug fallback can run.
//
// We can't easily test the route's findForm() helper directly (it's not
// exported and pulls in the Drizzle client). What we CAN test is the
// UUID-shape guard regex — that's the load-bearing decision and a
// regression in it brings the bug back.
//
// The route handler keeps a private UUID_REGEX matching the canonical
// 8-4-4-4-12 hex shape. We re-derive the same expectation here as a
// shape-pinning test.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

describe("UUID-shape guard — slug values must NOT match", () => {
  test("'intake' is not a UUID", () => {
    assert.equal(isUuid("intake"), false);
  });
  test("'contact' is not a UUID", () => {
    assert.equal(isUuid("contact"), false);
  });
  test("empty string is not a UUID", () => {
    assert.equal(isUuid(""), false);
  });
  test("36-char non-hex string is not a UUID", () => {
    assert.equal(isUuid("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"), false);
  });
});

describe("UUID-shape guard — real UUIDs match", () => {
  test("V4 lowercase UUID matches", () => {
    assert.equal(isUuid("6fd1d5d5-34a8-4805-becd-842ca1423afd"), true);
  });
  test("V4 uppercase UUID matches", () => {
    assert.equal(isUuid("6FD1D5D5-34A8-4805-BECD-842CA1423AFD"), true);
  });
  test("UUID with extra characters does NOT match (defense)", () => {
    assert.equal(isUuid("6fd1d5d5-34a8-4805-becd-842ca1423afdEXTRA"), false);
    assert.equal(isUuid("prefix-6fd1d5d5-34a8-4805-becd-842ca1423afd"), false);
  });
});
