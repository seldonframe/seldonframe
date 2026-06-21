import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { upscaleCdnImageUrl, isLowResImageUrl, pickServicePhotoSrc, isNonPhotoAsset } from "../../../src/lib/landing/service-photo";

describe("upscaleCdnImageUrl", () => {
  test("bumps a Wix fill render to a larger size", () => {
    const src = "https://static.wixstatic.com/media/abc~mv2.jpg/v1/crop/x_0,y_0,w_768,h_768/fill/w_206,h_206,al_c,q_80,enc_avif,quality_auto/x.jpg";
    const out = upscaleCdnImageUrl(src);
    assert.ok(out.includes("fill/w_1100,h_825"), out);
    assert.ok(!out.includes("w_206,h_206"));
  });
  test("passes through non-Wix / non-fill urls unchanged", () => {
    assert.equal(upscaleCdnImageUrl("https://images.unsplash.com/photo-1?w=1600"), "https://images.unsplash.com/photo-1?w=1600");
    assert.equal(upscaleCdnImageUrl(""), "");
  });
});

describe("isLowResImageUrl", () => {
  test("flags small Wix fill renders", () => {
    assert.equal(isLowResImageUrl("https://static.wixstatic.com/media/x/v1/fill/w_206,h_206,al_c/x.jpg"), true);
  });
  test("does not flag large or unknown urls", () => {
    assert.equal(isLowResImageUrl("https://static.wixstatic.com/media/x/v1/fill/w_1100,h_825/x.jpg"), false);
    assert.equal(isLowResImageUrl("https://images.unsplash.com/photo-1?w=1600"), false);
  });
});

describe("isNonPhotoAsset", () => {
  test("flags icon/logo/sprite/favicon/badge URLs", () => {
    assert.equal(isNonPhotoAsset("https://x.com/dallas-mowing-services-icon.png"), true);
    assert.equal(isNonPhotoAsset("https://x.com/assets/logo.png"), true);
    assert.equal(isNonPhotoAsset("https://x.com/img/sprite-2x.png"), true);
    assert.equal(isNonPhotoAsset("https://x.com/favicon.ico"), true);
    assert.equal(isNonPhotoAsset("https://x.com/badge.svg"), true);
  });
  test("flags any .svg (vector, not a photo)", () => {
    assert.equal(isNonPhotoAsset("https://x.com/photos/garden.svg"), true);
  });
  test("does NOT flag real photos", () => {
    assert.equal(isNonPhotoAsset("https://site.com/wp-content/uploads/2025/10/dallas-residential-landscaping-slider2.jpg"), false);
    assert.equal(isNonPhotoAsset("https://images.unsplash.com/photo-123?w=1600"), false);
    assert.equal(isNonPhotoAsset("https://static.wixstatic.com/media/x/v1/fill/w_1100,h_825/x.jpg"), false);
    assert.equal(isNonPhotoAsset(""), false);
    assert.equal(isNonPhotoAsset(undefined), false);
  });
  test("matches whole-word-ish, not substrings inside unrelated words", () => {
    // 'iconic' in a path should not trip it; be reasonable but don't over-engineer
    assert.equal(isNonPhotoAsset("https://x.com/photos/iconic-backyard.jpg"), false);
  });
});

describe("pickServicePhotoSrc", () => {
  test("returns an upscaled real src when present and upscalable", () => {
    const s = "https://static.wixstatic.com/media/x/v1/fill/w_206,h_206,al_c/x.jpg";
    assert.ok(pickServicePhotoSrc(s)?.includes("w_1100,h_825"));
  });
  test("returns null for blank input", () => {
    assert.equal(pickServicePhotoSrc(""), null);
    assert.equal(pickServicePhotoSrc(undefined), null);
  });
});
