// Win-ladder Task 4 — TDD for shouldBustPreview, the pure helper that
// decides whether the SeldonChat dock reloads the live preview iframe
// after a turn. jsdom component rendering is flaky in this repo, so this
// spec only exercises the extracted pure function.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { shouldBustPreview } from "../../../src/components/seldon-chat";

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
