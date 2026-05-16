import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildUserImageKey } from "../../../src/lib/uploads/user-image";

describe("buildUserImageKey", () => {
  test('produces a "users/{userId}/{filename}" key', () => {
    const key = buildUserImageKey({ userId: "user-1", filename: "logo.png" });
    assert.equal(key, "users/user-1/logo.png");
  });

  test("slugifies the filename to remove unsafe characters", () => {
    const key = buildUserImageKey({ userId: "user-1", filename: "My Logo (2026).png" });
    assert.equal(key, "users/user-1/my-logo-2026.png");
  });

  test("falls back to a generated name when filename is empty", () => {
    const key = buildUserImageKey({ userId: "user-1", filename: "", extension: "png" });
    assert.match(key, /^users\/user-1\/upload-[a-f0-9]+\.png$/);
  });

  test("rejects an empty userId", () => {
    assert.throws(() => buildUserImageKey({ userId: "", filename: "x.png" }), /userId/i);
  });
});
