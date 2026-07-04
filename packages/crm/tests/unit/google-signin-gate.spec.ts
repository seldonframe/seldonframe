import { test } from "node:test";
import assert from "node:assert/strict";
import { isGoogleAuthEnabled } from "@/lib/auth/google-enabled";

test("enabled only when both env vars present and non-empty", () => {
  assert.equal(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" }), true);
  assert.equal(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: "x" }), false);
  assert.equal(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "y" }), false);
  assert.equal(isGoogleAuthEnabled({}), false);
});
