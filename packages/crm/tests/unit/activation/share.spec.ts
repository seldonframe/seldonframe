// Unit tests for lib/activation/share.ts — Task 9 of the win-ladder +
// SeldonChat plan. buildShareAssets is pure-ish (qrcode encoding is
// deterministic for a given input); no DB/network involved.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildShareAssets } from "../../../src/lib/activation/share";

describe("buildShareAssets", () => {
  test("returns the siteUrl unchanged plus a data:image/png QR code", async () => {
    const result = await buildShareAssets({ siteUrl: "https://acme.app.seldonframe.com" });

    assert.equal(result.siteUrl, "https://acme.app.seldonframe.com");
    assert.match(result.qrDataUrl, /^data:image\/png/);
    assert.ok(result.qrDataUrl.length > 100, "expected a substantial data URL, not a stub");
  });

  test("produces a different QR code for a different siteUrl", async () => {
    const a = await buildShareAssets({ siteUrl: "https://acme.app.seldonframe.com" });
    const b = await buildShareAssets({ siteUrl: "https://widgetco.app.seldonframe.com" });

    assert.notEqual(a.qrDataUrl, b.qrDataUrl);
  });
});
