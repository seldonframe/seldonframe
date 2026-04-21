// Unit test — reference spec for the node:test + tsx pattern used across
// SeldonFrame PR-2b.1 onward. Seeded as the sample so future sessions
// reading this tree see how to author new specs consistently.
//
// Harness: node:test (built-in, Node 24+), tsx as the TS loader (already a
// devDep of @seldonframe/crm). Invoked via `pnpm test:unit` which globs
// every packages/*/tests/unit/**/*.spec.ts.
//
// Authoring conventions:
//   - One behavior per test. Name describes the behavior, not the input.
//   - Import production code via absolute workspace-relative paths (the
//     tsx loader handles @/ aliases too if a tsconfig path is set; prefer
//     explicit relatives from this file when the import is unambiguous).
//   - node:assert/strict for assertions — predictable deep-equal, no
//     surprising coercion.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isReservedSlug } from "../../src/lib/utils/reserved-slugs";

describe("isReservedSlug", () => {
  test("returns true for an exactly-matching reserved slug", () => {
    assert.equal(isReservedSlug("admin"), true);
  });

  test("is case-insensitive", () => {
    assert.equal(isReservedSlug("ADMIN"), true);
    assert.equal(isReservedSlug("Admin"), true);
  });

  test("trims surrounding whitespace before matching", () => {
    assert.equal(isReservedSlug("  admin  "), true);
  });

  test("returns false for slugs that are not reserved", () => {
    assert.equal(isReservedSlug("acme-corp"), false);
    assert.equal(isReservedSlug("jane-does-coaching"), false);
  });

  test("does not match substrings of reserved slugs", () => {
    // "administrator" is reserved; "admin1" should NOT match unless it's
    // exactly reserved. Guards against accidental prefix/infix matching.
    assert.equal(isReservedSlug("admin1"), false);
    assert.equal(isReservedSlug("booking-old"), false);
  });

  test("treats the empty string as not reserved", () => {
    assert.equal(isReservedSlug(""), false);
  });
});
