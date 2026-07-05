// Win-ladder Task 4 — TDD for shouldBustPreview, the pure helper that
// decides whether the SeldonChat dock reloads the live preview iframe
// after a turn. jsdom component rendering is flaky in this repo, so this
// spec only exercises the extracted pure function.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { shouldBustPreview, shouldAcceptDrop } from "../../../src/components/seldon-chat";

describe("shouldBustPreview", () => {
  test("true when a tool name starts with edit_", () => {
    assert.equal(shouldBustPreview([{ name: "edit_site" }]), true);
  });

  test("true when a tool name starts with update_", () => {
    assert.equal(shouldBustPreview([{ name: "update_section" }]), true);
  });

  test("true when a tool name starts with move_", () => {
    assert.equal(shouldBustPreview([{ name: "move_section" }]), true);
  });

  test("true when a tool name starts with delete_", () => {
    assert.equal(shouldBustPreview([{ name: "delete_section" }]), true);
  });

  test("true when a tool name starts with add_", () => {
    assert.equal(shouldBustPreview([{ name: "add_intake_field" }]), true);
  });

  test("true when a tool name starts with undo_", () => {
    assert.equal(shouldBustPreview([{ name: "undo_last_change" }]), true);
  });

  test("false for a read-only tool name", () => {
    assert.equal(shouldBustPreview([{ name: "get_site_structure" }]), false);
  });

  test("false for an empty tool list", () => {
    assert.equal(shouldBustPreview([]), false);
  });

  test("true when any tool in a mixed list matches, even if not first", () => {
    assert.equal(
      shouldBustPreview([{ name: "get_site_structure" }, { name: "edit_site" }]),
      true,
    );
  });
});

// T4 media-upload follow-up — the drop-zone must not accept a second file
// while the first is still uploading. The attach BUTTON is disabled during
// upload, but the drag-drop zone was not, so dropping a 2nd file fired a
// concurrent handleFile() (last-resolving wins pendingAttachment; the other's
// error could clobber it). shouldAcceptDrop is the pure guard both onDrop and
// the onDragOver affordance are gated on. (Component rendering is flaky under
// jsdom in this repo, so — like shouldBustPreview — only the pure predicate
// is exercised here.)
describe("shouldAcceptDrop", () => {
  test("accepts a drop when idle", () => {
    assert.equal(shouldAcceptDrop("idle"), true);
  });

  test("accepts a drop after a failed upload (error) so the operator can retry", () => {
    assert.equal(shouldAcceptDrop("error"), true);
  });

  test("rejects a drop while an upload is in flight (blocks the double-upload race)", () => {
    assert.equal(shouldAcceptDrop("uploading"), false);
  });
});
