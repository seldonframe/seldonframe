import { test } from "node:test";
import assert from "node:assert/strict";

import { harvestImagesFromHtml } from "../../../src/lib/web-onboarding/html-image-harvester";

const BASE = "https://dallasheatingac.com/";

test("resolves a root-relative <img src> to an absolute URL", () => {
  const r = harvestImagesFromHtml('<img src="/photos/ac-unit.jpg" alt="AC unit">', BASE);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].src, "https://dallasheatingac.com/photos/ac-unit.jpg");
  assert.equal(r.images[0].alt, "AC unit");
});

test("captures lazy-loaded data-src when src is a placeholder-less img", () => {
  const r = harvestImagesFromHtml('<img data-src="https://cdn.x.com/hero.jpg" class="lazy">', BASE);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].src, "https://cdn.x.com/hero.jpg");
});

test("does NOT mistake data-src for src (attribute-boundary)", () => {
  // A real srcset should win; ensure getAttr('src') isn't matching 'data-src'.
  const r = harvestImagesFromHtml('<img data-src="https://cdn.x.com/real.jpg">', BASE);
  assert.equal(r.images[0].src, "https://cdn.x.com/real.jpg");
});

test("picks the largest candidate from srcset", () => {
  const html =
    '<img srcset="/s/small.jpg 300w, /s/mid.jpg 768w, /s/big.jpg 1600w" alt="job">';
  const r = harvestImagesFromHtml(html, BASE);
  assert.equal(r.images[0].src, "https://dallasheatingac.com/s/big.jpg");
});

test("extracts CSS background-image url()", () => {
  const html = '<div class="hero" style="background-image:url(\'/img/masthead.jpg\')"></div>';
  const r = harvestImagesFromHtml(html, BASE);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].src, "https://dallasheatingac.com/img/masthead.jpg");
  assert.equal(r.images[0].section, "hero");
});

test("resolves protocol-relative //cdn URLs to https", () => {
  const r = harvestImagesFromHtml('<img src="//cdn.x.com/a.jpg">', BASE);
  assert.equal(r.images[0].src, "https://cdn.x.com/a.jpg");
});

test("captures og:image as a hero candidate (regardless of attr order)", () => {
  const html = '<meta content="https://cdn.x.com/og.jpg" property="og:image">';
  const r = harvestImagesFromHtml(html, BASE);
  assert.equal(r.ogImage, "https://cdn.x.com/og.jpg");
});

test("detects the logo from an <img> and does not list it as a photo", () => {
  const html =
    '<img src="/assets/site-logo.png" alt="Dallas Heating Logo"><img src="/p/tech.jpg" alt="tech">';
  const r = harvestImagesFromHtml(html, BASE);
  assert.equal(r.logo, "https://dallasheatingac.com/assets/site-logo.png");
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].src, "https://dallasheatingac.com/p/tech.jpg");
});

test("falls back to apple-touch-icon for the logo when no <img> logo exists", () => {
  const html = '<link rel="apple-touch-icon" href="/icons/touch.png"><img src="/p/x.jpg">';
  const r = harvestImagesFromHtml(html, BASE);
  assert.equal(r.logo, "https://dallasheatingac.com/icons/touch.png");
});

test("rejects data: URIs, tracking pixels, and SVGs from photos", () => {
  const html = [
    '<img src="data:image/gif;base64,R0lGOD">',
    '<img src="/img/1x1.png">',
    '<img src="/img/tracking/pixel.gif">',
    '<img src="/img/logo-sprite.svg">',
    '<img src="/img/real-photo.jpg">',
  ].join("");
  const r = harvestImagesFromHtml(html, BASE);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].src, "https://dallasheatingac.com/img/real-photo.jpg");
});

test("dedupes the same image path ignoring the query string", () => {
  const html =
    '<img src="/p/hero.jpg?w=400"><img src="/p/hero.jpg?w=1600"><img src="/p/other.jpg">';
  const r = harvestImagesFromHtml(html, BASE);
  assert.equal(r.images.length, 2);
});

test("classifies by alt/class hints", () => {
  const html =
    '<img src="/a.jpg" class="gallery-item"><img src="/b.jpg" alt="Our team photo">';
  const r = harvestImagesFromHtml(html, BASE);
  const bySrc = Object.fromEntries(r.images.map((i) => [i.src.split("/").pop(), i.section]));
  assert.equal(bySrc["a.jpg"], "gallery");
  assert.equal(bySrc["b.jpg"], "about");
});

test("never throws on empty / non-string input", () => {
  assert.deepEqual(harvestImagesFromHtml("", BASE), { images: [], logo: null, ogImage: null });
  // @ts-expect-error — exercising the runtime guard
  assert.deepEqual(harvestImagesFromHtml(undefined, BASE), { images: [], logo: null, ogImage: null });
});
