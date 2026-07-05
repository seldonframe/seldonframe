import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { setR1Media } from "../../../src/lib/landing/set-r1-media";
import type { R1LandingPayload } from "../../../src/lib/landing/r1-payload-prompt";

function basePayload(): R1LandingPayload {
  return {
    hero: {
      archetype: "bold-urgency",
      businessName: "Acme Plumbing",
      tagline: "We fix it fast.",
      subhead: "24/7 emergency service.",
      primaryCTA: { label: "Call now", href: "tel:5551234567" },
      trustBadges: [{ label: "Licensed" }],
      heroImage: { src: "https://example.com/old-hero.jpg", alt: "old hero" },
    },
    services: {
      archetype: "bold-urgency",
      heading: "Our services",
      services: [
        { id: "svc-1", name: "Drain cleaning", description: "We clear drains." },
        { id: "svc-2", name: "Leak repair", description: "We fix leaks." },
      ],
    },
    testimonials: {
      archetype: "bold-urgency",
      heading: "What customers say",
      testimonials: [],
    },
    faq: {
      archetype: "bold-urgency",
      heading: "FAQ",
      items: [],
    },
    footer: {
      archetype: "bold-urgency",
      businessName: "Acme Plumbing",
      phone: "5551234567",
    },
  };
}

function makeDeps(payload: R1LandingPayload) {
  const saved: { orgId?: string; payload?: R1LandingPayload; archetype?: string } = {};
  const deps = {
    load: async (_orgId: string) => ({
      payload,
      archetype: "bold-urgency" as const,
    }),
    save: async (orgId: string, nextPayload: R1LandingPayload, archetype: string) => {
      saved.orgId = orgId;
      saved.payload = nextPayload;
      saved.archetype = archetype;
    },
    revalidate: (_path: string) => {},
  };
  return { deps, saved };
}

describe("setR1Media", () => {
  test("hero_image slot writes payload.hero.heroImage and nothing else", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Media(
      "org-1",
      { slot: "hero_image", src: "https://example.com/new-hero.jpg", alt: "new hero" },
      deps,
    );

    assert.deepEqual(result, { ok: true, slot: "hero_image" });
    assert.deepEqual(saved.payload?.hero.heroImage, {
      src: "https://example.com/new-hero.jpg",
      alt: "new hero",
    });
    // Nothing else on hero touched.
    assert.equal(saved.payload?.hero.tagline, payload.hero.tagline);
    assert.equal(saved.payload?.hero.businessName, payload.hero.businessName);
    assert.equal(saved.payload?.hero.backgroundImage, undefined);
    assert.equal(saved.payload?.hero.backgroundVideo, undefined);
    // Rest of payload untouched (deep equal on other top-level sections).
    assert.deepEqual(saved.payload?.services, payload.services);
    assert.deepEqual(saved.payload?.testimonials, payload.testimonials);
    assert.deepEqual(saved.payload?.faq, payload.faq);
    assert.deepEqual(saved.payload?.footer, payload.footer);
  });

  test("hero_background slot writes payload.hero.backgroundImage and nothing else", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Media(
      "org-1",
      { slot: "hero_background", src: "https://example.com/bg.jpg", alt: "bg" },
      deps,
    );

    assert.deepEqual(result, { ok: true, slot: "hero_background" });
    assert.deepEqual(saved.payload?.hero.backgroundImage, {
      src: "https://example.com/bg.jpg",
      alt: "bg",
    });
    // heroImage (foreground) untouched.
    assert.deepEqual(saved.payload?.hero.heroImage, payload.hero.heroImage);
    assert.equal(saved.payload?.hero.backgroundVideo, undefined);
  });

  test("hero_background_video slot writes payload.hero.backgroundVideo including poster", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Media(
      "org-1",
      { slot: "hero_background_video", src: "https://example.com/bg.mp4", poster: "https://example.com/poster.jpg" },
      deps,
    );

    assert.deepEqual(result, { ok: true, slot: "hero_background_video" });
    assert.deepEqual(saved.payload?.hero.backgroundVideo, {
      src: "https://example.com/bg.mp4",
      poster: "https://example.com/poster.jpg",
    });
    // Other hero media untouched.
    assert.deepEqual(saved.payload?.hero.heroImage, payload.hero.heroImage);
    assert.equal(saved.payload?.hero.backgroundImage, undefined);
  });

  test("hero_background_video slot with no poster carries undefined poster through", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Media(
      "org-1",
      { slot: "hero_background_video", src: "https://example.com/bg.mp4" },
      deps,
    );

    assert.deepEqual(result, { ok: true, slot: "hero_background_video" });
    assert.deepEqual(saved.payload?.hero.backgroundVideo, {
      src: "https://example.com/bg.mp4",
      poster: undefined,
    });
  });

  test("service_photo:<index> slot writes payload.services.services[index].photo and nothing else", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Media(
      "org-1",
      { slot: "service_photo:1", src: "https://example.com/svc2.jpg", alt: "svc2 photo" },
      deps,
    );

    assert.deepEqual(result, { ok: true, slot: "service_photo:1" });
    assert.deepEqual(saved.payload?.services.services[1].photo, {
      src: "https://example.com/svc2.jpg",
      alt: "svc2 photo",
    });
    // Sibling service untouched.
    assert.equal(saved.payload?.services.services[0].photo, undefined);
    assert.equal(saved.payload?.services.services[0].name, "Drain cleaning");
    // Hero + rest of payload untouched.
    assert.deepEqual(saved.payload?.hero, payload.hero);
  });

  test("service_photo:<out-of-range> is rejected with no save", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Media(
      "org-1",
      { slot: "service_photo:99", src: "https://example.com/x.jpg" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "service_index_out_of_range" });
    assert.equal(saved.payload, undefined);
  });

  test("unknown slot is rejected with no save", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Media(
      "org-1",
      { slot: "footer_logo", src: "https://example.com/x.jpg" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "unknown_slot" });
    assert.equal(saved.payload, undefined);
  });

  test("no r1 landing found returns an error with no save", async () => {
    const { saved } = makeDeps(basePayload());
    const deps = {
      load: async (_orgId: string) => null,
      save: async () => { throw new Error("save should not be called"); },
      revalidate: (_path: string) => {},
    };

    const result = await setR1Media(
      "org-1",
      { slot: "hero_image", src: "https://example.com/x.jpg" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "no_landing_exists" });
    assert.equal(saved.payload, undefined);
  });
});
