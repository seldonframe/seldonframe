// packages/crm/tests/unit/auth/app-host-redirect.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isExemptHost,
  normalizeHost,
  resolveAppHostRedirectTarget,
} from "../../../src/lib/auth/app-host-redirect";

const APP = "https://app.seldonframe.com";

describe("resolveAppHostRedirectTarget", () => {
  test("www host → app-origin URL with path and query byte-identical", () => {
    const target = resolveAppHostRedirectTarget({
      requestHost: "www.seldonframe.com",
      appOrigin: APP,
      path: "/record",
      search: "?session=abc-123&claimed=1&shared=x%20y",
    });
    assert.equal(target, "https://app.seldonframe.com/record?session=abc-123&claimed=1&shared=x%20y");
  });

  test("apex host redirects too", () => {
    const target = resolveAppHostRedirectTarget({
      requestHost: "seldonframe.com", appOrigin: APP, path: "/record", search: "",
    });
    assert.equal(target, "https://app.seldonframe.com/record");
  });

  test("already on app host → null", () => {
    assert.equal(
      resolveAppHostRedirectTarget({ requestHost: "app.seldonframe.com", appOrigin: APP, path: "/record", search: "?a=1" }),
      null,
    );
  });

  test("exempt hosts → null (localhost, 127.0.0.1, vercel preview, empty)", () => {
    for (const host of ["localhost", "localhost:3000", "127.0.0.1", "my-preview.vercel.app", ""]) {
      assert.equal(
        resolveAppHostRedirectTarget({ requestHost: host, appOrigin: APP, path: "/record", search: "" }),
        null,
        host || "(empty)",
      );
    }
  });
});

describe("host helpers", () => {
  test("normalizeHost lowercases, trims, strips port", () => {
    assert.equal(normalizeHost(" WWW.SeldonFrame.com:443 "), "www.seldonframe.com");
  });
  test("isExemptHost matrix", () => {
    assert.equal(isExemptHost("localhost"), true);
    assert.equal(isExemptHost("x.vercel.app"), true);
    assert.equal(isExemptHost("www.seldonframe.com"), false);
  });
});
