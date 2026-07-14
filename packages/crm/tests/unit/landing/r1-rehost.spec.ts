// Blob re-host of the client's captured images (world-class images, part 3).
//
// Re-hosting makes the client's OWN scraped photos/logo permanent (Blob) so the
// public site never depends on a hotlink that can 403/expire. Stock (Unsplash/
// Pexels) URLs are hotlink-friendly by their API terms and are left as-is;
// already-Blob URLs are skipped. Best-effort — a failed re-host keeps the
// original URL so workspace creation never blocks.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isRehostableSourceUrl,
  rehostCapturedImages,
} from "../../../src/lib/landing/r1-payload-generator";
import type { R1LandingPayload } from "../../../src/lib/landing/r1-payload-prompt";

describe("isRehostableSourceUrl", () => {
  test("true for the client's own https CDN image", () => {
    assert.equal(isRehostableSourceUrl("https://www.dallasheatingac.com/img/hero.webp"), true);
  });
  test("false for stock CDNs (Unsplash / Pexels)", () => {
    assert.equal(isRehostableSourceUrl("https://images.unsplash.com/photo-123"), false);
    assert.equal(isRehostableSourceUrl("https://images.pexels.com/photos/1/x.jpg"), false);
    assert.equal(isRehostableSourceUrl("https://unsplash.com/x"), false);
  });
  test("false for already-Blob URLs", () => {
    assert.equal(
      isRehostableSourceUrl("https://abc123.public.blob.vercel-storage.com/media/external/x.jpg"),
      false,
    );
  });
  test("false for empty / null / non-http", () => {
    assert.equal(isRehostableSourceUrl(""), false);
    assert.equal(isRehostableSourceUrl(null), false);
    assert.equal(isRehostableSourceUrl(undefined), false);
    assert.equal(isRehostableSourceUrl("data:image/png;base64,xx"), false);
  });
});

function samplePayload(): R1LandingPayload {
  return {
    hero: {
      archetype: "bold-urgency",
      businessName: "X",
      tagline: "t",
      subhead: "s",
      primaryCTA: { label: "a", href: "/book" },
      trustBadges: [],
      heroImage: { src: "https://client.com/hero.jpg", alt: "h" },
    },
    services: {
      archetype: "bold-urgency",
      heading: "H",
      services: [
        { id: "s1", name: "A", description: "d", photo: { src: "https://client.com/a.jpg", alt: "a" } },
        { id: "s2", name: "B", description: "d", photo: { src: "https://images.unsplash.com/photo-9", alt: "b" } },
      ],
    },
    testimonials: { archetype: "bold-urgency", heading: "H", testimonials: [] },
    faq: { archetype: "bold-urgency", heading: "H", items: [] },
    footer: { archetype: "bold-urgency", businessName: "X", phone: "1" },
    logo: "https://client.com/logo.png",
  };
}

describe("rehostCapturedImages", () => {
  test("re-hosts only the client's own images (hero, scraped service, logo), never stock", async () => {
    const seen: string[] = [];
    const fake = async (u: string) => {
      seen.push(u);
      return `https://abc.public.blob.vercel-storage.com/media/external/${encodeURIComponent(u).slice(-16)}.jpg`;
    };
    const p = samplePayload();
    const { attempted, rehosted } = await rehostCapturedImages(p, fake);

    assert.equal(attempted, 3); // hero + service A + logo; Unsplash service B skipped
    assert.equal(rehosted, 3);
    assert.match(p.hero.heroImage!.src, /blob\.vercel-storage\.com/);
    assert.match(p.services.services[0].photo!.src, /blob\.vercel-storage\.com/);
    assert.equal(p.services.services[1].photo!.src, "https://images.unsplash.com/photo-9"); // untouched
    assert.match(p.logo!, /blob\.vercel-storage\.com/);
    assert.ok(!seen.some((u) => u.includes("unsplash")), "stock URL must never be re-hosted");
  });

  test("keeps the original URL when re-host fails (graceful degrade)", async () => {
    const fake = async (u: string) => u; // simulate failure → returns original
    const p = samplePayload();
    const { attempted, rehosted } = await rehostCapturedImages(p, fake);
    assert.equal(attempted, 3);
    assert.equal(rehosted, 0);
    assert.equal(p.hero.heroImage!.src, "https://client.com/hero.jpg");
    assert.equal(p.logo, "https://client.com/logo.png");
  });

  test("no-op when there are no client images to re-host", async () => {
    const p = samplePayload();
    p.hero.heroImage = { src: "https://images.unsplash.com/photo-1", alt: "" };
    p.services.services = [];
    delete p.logo;
    let called = 0;
    const fake = async (u: string) => {
      called++;
      return u;
    };
    const { attempted } = await rehostCapturedImages(p, fake);
    assert.equal(attempted, 0);
    assert.equal(called, 0);
  });
});
