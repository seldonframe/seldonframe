// ============================================================================
// v1.10.0 — upload_workspace_image (pure helpers)
// ============================================================================
//
// Tests cover:
//   - validateImageUploadInput (slot enum, content-type, byte-size cap)
//   - buildImageBlobPath (workspace-scoped namespacing + filename
//     sanitization)
//
// The DB-write + Vercel Blob `put()` paths are integration-test
// territory (queued as v1.10+ contract per docs/CONTRACTS.md). The
// pure validators + path builder cover the security-relevant bits.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildImageBlobPath,
  validateImageUploadInput,
  IMAGE_MAX_BYTES,
  ALLOWED_IMAGE_CONTENT_TYPES,
  type UploadImageInput,
} from "@/lib/page-blocks/images";

const BASE_INPUT: UploadImageInput = {
  workspace_id: "00000000-0000-0000-0000-000000000001",
  slot: "logo",
  file_name: "company-logo.png",
  content_type: "image/png",
  byte_size: 12_345,
};

test("validateImageUploadInput accepts valid input", () => {
  const result = validateImageUploadInput(BASE_INPUT);
  assert.equal(result.ok, true);
});

test("validateImageUploadInput rejects unknown slot", () => {
  const result = validateImageUploadInput({
    ...BASE_INPUT,
    slot: "favicon" as unknown as UploadImageInput["slot"],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /slot/i.test(e)));
});

test("validateImageUploadInput rejects unsupported content_type", () => {
  // Image-only enforcement. text/html, application/pdf etc. are
  // explicit rejects — protects against hostile uploads.
  const result = validateImageUploadInput({
    ...BASE_INPUT,
    content_type: "application/pdf",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /content_type|content type|application\/pdf/i.test(e)));
});

test("validateImageUploadInput accepts each whitelisted image type", () => {
  for (const ct of ALLOWED_IMAGE_CONTENT_TYPES) {
    const result = validateImageUploadInput({ ...BASE_INPUT, content_type: ct });
    assert.equal(result.ok, true, `expected ${ct} to validate`);
  }
});

test("validateImageUploadInput rejects empty file (size 0)", () => {
  const result = validateImageUploadInput({ ...BASE_INPUT, byte_size: 0 });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /empty|size|zero/i.test(e)));
});

test("validateImageUploadInput rejects oversize file", () => {
  const result = validateImageUploadInput({
    ...BASE_INPUT,
    byte_size: IMAGE_MAX_BYTES + 1,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /size|too large|max/i.test(e)));
});

test("validateImageUploadInput rejects missing workspace_id", () => {
  const result = validateImageUploadInput({ ...BASE_INPUT, workspace_id: "" });
  assert.equal(result.ok, false);
});

test("buildImageBlobPath includes workspace id and slot", () => {
  const path = buildImageBlobPath({
    workspace_id: "abc-123",
    slot: "logo",
    file_name: "company.png",
  });
  assert.match(path, /^org\/abc-123\/images\/logo\//);
  assert.match(path, /\.png$/);
});

test("buildImageBlobPath sanitizes hostile filenames", () => {
  // Path traversal + spaces + special chars must not survive into the
  // blob key. We keep the extension (for content-type sniffing) but
  // strip everything else.
  const path = buildImageBlobPath({
    workspace_id: "abc-123",
    slot: "hero_background",
    file_name: "../../etc/passwd",
  });
  assert.ok(!path.includes(".."));
  assert.ok(!path.includes("/etc/"));
  assert.match(path, /^org\/abc-123\/images\/hero_background\//);
});

test("buildImageBlobPath defaults extension when filename has none", () => {
  const path = buildImageBlobPath({
    workspace_id: "abc-123",
    slot: "logo",
    file_name: "no-extension",
  });
  // Should still produce a usable path (the upload code derives
  // extension from content_type when filename is bare).
  assert.match(path, /^org\/abc-123\/images\/logo\//);
});

test("buildImageBlobPath produces unique paths across calls (no collision)", () => {
  // Random suffix in the path means two uploads of the SAME filename
  // don't collide (otherwise a re-upload would silently overwrite the
  // previous version, breaking any cached old URL).
  const a = buildImageBlobPath({
    workspace_id: "abc-123",
    slot: "logo",
    file_name: "logo.png",
  });
  const b = buildImageBlobPath({
    workspace_id: "abc-123",
    slot: "logo",
    file_name: "logo.png",
  });
  assert.notEqual(a, b);
});
