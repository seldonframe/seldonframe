// Agent marketplace — listing TAG conventions (pure).
//
// The seller's "List on the marketplace" flow links a kind:'agent' listing back
// to its source agent_templates row via a reserved `tmpl:<id>` tag (no
// templateId column, no migration). These helpers keep that reserved metadata
// separate from the seller's user-facing tags. Covered in isolation here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  TEMPLATE_LINK_TAG_PREFIX,
  buildListingTags,
  splitListingTags,
  normalizeUserTags,
} from "../../../src/lib/marketplace/listing-tags";

describe("listing-tags", () => {
  test("buildListingTags puts the tmpl: link first, then user tags", () => {
    const tags = buildListingTags({ templateId: "abc-123", userTags: ["plumbing", "24/7"] });
    assert.equal(tags[0], `${TEMPLATE_LINK_TAG_PREFIX}abc-123`);
    assert.deepEqual(tags.slice(1), ["plumbing", "24/7"]);
  });

  test("buildListingTags works with no user tags", () => {
    assert.deepEqual(buildListingTags({ templateId: "t1" }), ["tmpl:t1"]);
  });

  test("splitListingTags recovers the templateId and strips reserved tags", () => {
    const { templateId, userTags } = splitListingTags([
      "tmpl:abc-123",
      "surfaces:voice,sms",
      "builder:Acme",
      "plumbing",
      "emergency",
    ]);
    assert.equal(templateId, "abc-123");
    assert.deepEqual(userTags, ["plumbing", "emergency"]);
  });

  test("splitListingTags → null templateId when absent", () => {
    const { templateId, userTags } = splitListingTags(["plumbing"]);
    assert.equal(templateId, null);
    assert.deepEqual(userTags, ["plumbing"]);
  });

  test("round-trip: build then split yields the same user tags + id", () => {
    const built = buildListingTags({ templateId: "tmpl-xyz", userTags: ["reviews", "google"] });
    const { templateId, userTags } = splitListingTags(built);
    assert.equal(templateId, "tmpl-xyz");
    assert.deepEqual(userTags, ["reviews", "google"]);
  });

  test("normalizeUserTags trims, dedupes (case-insensitive), drops empties + reserved", () => {
    const out = normalizeUserTags([
      "  Plumbing  ",
      "plumbing",
      "",
      "   ",
      "tmpl:sneaky",
      "surfaces:voice",
      "Reviews",
    ]);
    assert.deepEqual(out, ["Plumbing", "Reviews"]);
  });

  test("normalizeUserTags caps at 12 tags", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    assert.equal(normalizeUserTags(many).length, 12);
  });

  test("a seller cannot smuggle a reserved tag through user tags", () => {
    const tags = buildListingTags({ templateId: "t1", userTags: ["tmpl:evil", "builder:Fake", "real"] });
    // Only ONE tmpl: tag (the real link), no builder: tag, plus the real tag.
    assert.deepEqual(tags, ["tmpl:t1", "real"]);
  });

  test("defensive: null / undefined inputs don't throw", () => {
    assert.deepEqual(normalizeUserTags(null), []);
    assert.deepEqual(normalizeUserTags(undefined), []);
    assert.deepEqual(splitListingTags(null), { templateId: null, userTags: [] });
  });
});
