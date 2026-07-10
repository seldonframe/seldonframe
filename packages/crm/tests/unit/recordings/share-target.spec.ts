// packages/crm/tests/unit/recordings/share-target.spec.ts
//
// Pins the Web Share Target constants (src/lib/recordings/share-target.ts).
// public/record-sw.js can't import this TS module — it's an unbundled
// script served straight from /public — so it duplicates these three
// literals verbatim in its own header. This spec is the only automated
// guard that the TS side hasn't drifted; a change to record-sw.js's copies
// needs a matching change here (and vice versa), reviewed by eye.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  SHARE_CACHE_NAME,
  SHARE_TARGET_PATH,
  STAGED_RECORDING_CACHE_KEY,
} from "../../../src/lib/recordings/share-target";

describe("Web Share Target constants", () => {
  test("SHARE_TARGET_PATH matches the manifest's share_target.action and the fallback route's path", () => {
    assert.equal(SHARE_TARGET_PATH, "/record/share-target");
  });

  test("SHARE_CACHE_NAME and STAGED_RECORDING_CACHE_KEY are non-empty, stable strings", () => {
    assert.equal(SHARE_CACHE_NAME, "sf-record-share");
    assert.equal(STAGED_RECORDING_CACHE_KEY, "/record/__staged-recording__");
  });

  test("the staged cache key lives under /record (never collides with a real route)", () => {
    assert.ok(STAGED_RECORDING_CACHE_KEY.startsWith("/record/"));
    assert.notEqual(STAGED_RECORDING_CACHE_KEY, SHARE_TARGET_PATH);
  });
});
