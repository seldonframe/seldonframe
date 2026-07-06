// Media-targeting fix (map-only): buildMediaSlotMap is a PURE function —
// given an r1 payload it returns the labeled slot map the copilot's
// list_media_slots tool surfaces, in visual order (hero slots first, then
// one entry per service in array order). No DB, no I/O; defensive against
// missing/partial payloads so a malformed payload never throws.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildMediaSlotMap } from "../../../src/lib/landing/set-r1-media";
import type { R1LandingPayload } from "../../../src/lib/landing/r1-payload-prompt";

function basePayload(): R1LandingPayload {
  return {
    hero: {
      archetype: "bold-urgency",
      businessName: "Acme Electric",
      tagline: "We fix it fast.",
      subhead: "24/7 emergency service.",
      primaryCTA: { label: "Call now", href: "tel:5551234567" },
      trustBadges: [{ label: "Licensed" }],
      heroImage: { src: "https://example.com/hero.jpg", alt: "hero" },
      backgroundImage: { src: "https://example.com/bg.jpg", alt: "bg" },
    },
    services: {
      archetype: "bold-urgency",
      heading: "Our services",
      services: [
        { id: "svc-1", name: "Drain cleaning", description: "We clear drains." },
        {
          id: "svc-2",
          name: "Emergency Electrical Repair",
          description: "24/7 electrical.",
          photo: { src: "https://example.com/electrical.jpg", alt: "electrical" },
        },
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
      businessName: "Acme Electric",
      phone: "5551234567",
    },
  };
}

describe("buildMediaSlotMap", () => {
  test("always includes the 3 hero slots first, with correct hasImage flags", () => {
    const slots = buildMediaSlotMap(basePayload());
    assert.deepEqual(
      slots.slice(0, 3).map((s) => s.slot),
      ["hero_image", "hero_background", "hero_background_video"],
    );
    assert.equal(slots[0]!.hasImage, true); // heroImage set
    assert.equal(slots[1]!.hasImage, true); // backgroundImage set
    assert.equal(slots[2]!.hasImage, false); // no backgroundVideo
    assert.equal(slots[0]!.label, "Hero photo");
    assert.equal(slots[1]!.label, "Hero background image");
    assert.equal(slots[2]!.label, "Hero background video");
  });

  test("one service_photo:<i> per service, in order, labeled by name, hasImage from photo presence", () => {
    const slots = buildMediaSlotMap(basePayload());
    const serviceSlots = slots.slice(3);
    assert.equal(serviceSlots.length, 2);

    assert.equal(serviceSlots[0]!.slot, "service_photo:0");
    assert.equal(serviceSlots[0]!.label, "Drain cleaning");
    assert.equal(serviceSlots[0]!.hasImage, false);

    assert.equal(serviceSlots[1]!.slot, "service_photo:1");
    assert.equal(serviceSlots[1]!.label, "Emergency Electrical Repair");
    assert.equal(serviceSlots[1]!.hasImage, true);
  });

  test("empty services array yields hero-only slots", () => {
    const payload = basePayload();
    payload.services = { ...payload.services, services: [] };
    const slots = buildMediaSlotMap(payload);
    assert.equal(slots.length, 3);
    assert.deepEqual(
      slots.map((s) => s.slot),
      ["hero_image", "hero_background", "hero_background_video"],
    );
  });

  test("missing services section yields hero-only slots (no throw)", () => {
    const payload = basePayload();
    // @ts-expect-error deliberately simulating a malformed/legacy payload
    delete payload.services;
    const slots = buildMediaSlotMap(payload);
    assert.equal(slots.length, 3);
  });

  test("missing hero media fields degrade to hasImage:false, never throw", () => {
    const payload = basePayload();
    payload.hero = {
      ...payload.hero,
      heroImage: undefined,
      backgroundImage: undefined,
      backgroundVideo: undefined,
    };
    const slots = buildMediaSlotMap(payload);
    assert.equal(slots[0]!.hasImage, false);
    assert.equal(slots[1]!.hasImage, false);
    assert.equal(slots[2]!.hasImage, false);
  });

  test("a service missing a photo field degrades to hasImage:false, never throw", () => {
    const payload = basePayload();
    payload.services.services = payload.services.services.map(({ photo: _photo, ...rest }) => rest);
    const slots = buildMediaSlotMap(payload);
    const serviceSlots = slots.slice(3);
    assert.equal(serviceSlots[1]!.hasImage, false);
  });
});
