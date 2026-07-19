// Media T4 — chat attach/upload token grant decision.
//
// `decideMediaUploadGrant` is the pure core of the Blob client-upload
// token route (POST /api/v1/workspace/media/upload). It answers: given a
// resolved orgId (or null, meaning "no session") and the browser's
// requested content type, should we grant an upload token, and with what
// allow-list/cap? This is deliberately decoupled from `handleUpload`/
// `onBeforeGenerateToken` (both untestable without a live Blob token) so
// the actual security-relevant decision — auth required, content-type
// allow-listed, size capped — has direct unit coverage.
//
// To run:
//   cd packages/crm
//   node --import tsx --test tests/unit/media/upload-token.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { decideMediaUploadGrant } from "../../../src/lib/media/upload-token";
import { IMAGE_MAX_BYTES } from "../../../src/lib/page-blocks/images";
import { VIDEO_MAX_BYTES } from "../../../src/lib/media/resolve-url";

describe("decideMediaUploadGrant", () => {
  test("rejects when there is no session (orgId null)", () => {
    const result = decideMediaUploadGrant({ orgId: null, contentType: "image/png" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "unauthorized");
  });

  test("rejects a disallowed content type", () => {
    const result = decideMediaUploadGrant({
      orgId: "org_1",
      contentType: "application/pdf",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "content_type_not_allowed");
  });

  test("accepts an allowed image content type with the image cap", () => {
    const result = decideMediaUploadGrant({
      orgId: "org_1",
      contentType: "image/png",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.kind, "image");
      assert.equal(result.maximumSizeInBytes, IMAGE_MAX_BYTES);
    }
  });

  test("accepts an allowed video content type with the (larger) video cap", () => {
    const result = decideMediaUploadGrant({
      orgId: "org_1",
      contentType: "video/mp4",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.kind, "video");
      assert.equal(result.maximumSizeInBytes, VIDEO_MAX_BYTES);
    }
  });

  test("grants a PER-KIND cap: the small image cap for images, the larger video cap for videos", () => {
    const imageGrant = decideMediaUploadGrant({ orgId: "org_1", contentType: "image/png" });
    const videoGrant = decideMediaUploadGrant({ orgId: "org_1", contentType: "video/mp4" });
    assert.equal(imageGrant.ok, true);
    assert.equal(videoGrant.ok, true);
    if (imageGrant.ok && videoGrant.ok) {
      // The grant must be scoped to the DECLARED kind, not a shared max.
      // Regression guard: a client claiming `image/png` previously received
      // the 50 MB video allowance, wasting Blob storage on oversized images.
      assert.equal(imageGrant.maximumSizeInBytes, IMAGE_MAX_BYTES);
      assert.equal(videoGrant.maximumSizeInBytes, VIDEO_MAX_BYTES);
      assert.ok(imageGrant.maximumSizeInBytes < videoGrant.maximumSizeInBytes);
    }
  });

  test("allowedContentTypes returned covers both images and videos", () => {
    const result = decideMediaUploadGrant({ orgId: "org_1", contentType: "video/webm" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.allowedContentTypes.includes("video/webm"));
      assert.ok(result.allowedContentTypes.some((t) => t.startsWith("image/")));
    }
  });

  test("rejects an empty/missing content type", () => {
    const result = decideMediaUploadGrant({ orgId: "org_1", contentType: "" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "content_type_not_allowed");
  });
});
