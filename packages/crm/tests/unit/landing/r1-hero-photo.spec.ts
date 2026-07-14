import { test } from "node:test";
import assert from "node:assert/strict";

import { pickHeroPhotoFromFacts } from "../../../src/lib/landing/r1-payload-generator";
import type { ExtractedBusinessFacts } from "../../../src/lib/web-onboarding/extraction-prompt";

const base: ExtractedBusinessFacts = {
  business_name: "Dallas Heating and Air",
  city: "Dallas",
  state: "TX",
  phone: "972-423-0012",
  services: ["AC repair"],
  business_description: "HVAC.",
};

test("prefers a hero-classified captured photo over other sections", () => {
  const facts: ExtractedBusinessFacts = {
    ...base,
    photos: [
      { src: "https://x.com/service.jpg", section: "services" },
      { src: "https://x.com/hero.jpg", section: "hero" },
    ],
  };
  assert.equal(pickHeroPhotoFromFacts(facts)?.src, "https://x.com/hero.jpg");
});

test("falls back to the first usable photo when none are hero-classified", () => {
  const facts: ExtractedBusinessFacts = {
    ...base,
    photos: [
      { src: "https://x.com/a.jpg", section: "gallery" },
      { src: "https://x.com/b.jpg", section: "about" },
    ],
  };
  assert.equal(pickHeroPhotoFromFacts(facts)?.src, "https://x.com/a.jpg");
});

test("skips svg/non-http candidates", () => {
  const facts: ExtractedBusinessFacts = {
    ...base,
    photos: [
      { src: "https://x.com/logo.svg", section: "hero" },
      { src: "https://x.com/real.jpg", section: "gallery" },
    ],
  };
  assert.equal(pickHeroPhotoFromFacts(facts)?.src, "https://x.com/real.jpg");
});

test("returns null when the site had no scrapeable photo", () => {
  assert.equal(pickHeroPhotoFromFacts(base), null);
  assert.equal(pickHeroPhotoFromFacts({ ...base, photos: [] }), null);
  assert.equal(pickHeroPhotoFromFacts({ ...base, photos: null }), null);
});
