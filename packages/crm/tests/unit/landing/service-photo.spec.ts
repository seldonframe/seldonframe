import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { upscaleCdnImageUrl, isLowResImageUrl, pickServicePhotoSrc } from "../../../src/lib/landing/service-photo";

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
