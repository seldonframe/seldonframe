// packages/crm/tests/unit/onboarding/file-validation.spec.ts
//
// TDD step 1 — file-upload field validation helper (pure, no IO).
// Uses node:test + assert/strict (project convention; no vitest).

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateUploadField } from "../../../src/lib/uploads/file-validation";

describe("validateUploadField", () => {
  const cfg = { accept: [".csv", ".xlsx"], maxSizeMb: 10 };

  it("accepts an allowed type under the size cap", () => {
    assert.deepEqual(
      validateUploadField({ name: "contacts.csv", sizeBytes: 1_000 }, cfg),
      { ok: true },
    );
  });

  it("rejects a disallowed extension", () => {
    assert.deepEqual(
      validateUploadField({ name: "evil.exe", sizeBytes: 10 }, cfg),
      { ok: false, reason: "type" },
    );
  });

  it("rejects a file over the size cap", () => {
    assert.deepEqual(
      validateUploadField({ name: "big.csv", sizeBytes: 11 * 1024 * 1024 }, cfg),
      { ok: false, reason: "size" },
    );
  });

  it("matches accept case-insensitively", () => {
    assert.deepEqual(
      validateUploadField({ name: "CONTACTS.CSV", sizeBytes: 1 }, cfg),
      { ok: true },
    );
  });
});
