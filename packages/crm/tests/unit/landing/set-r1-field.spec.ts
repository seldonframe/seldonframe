import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  setR1Field,
  resolveR1FieldPath,
  type SetR1FieldDeps,
} from "../../../src/lib/landing/set-r1-field";
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
      items: [
        { id: "faq-1", question: "Do you offer emergency service?", answer: "Yes, 24/7." },
        { id: "faq-2", question: "Are you licensed?", answer: "Yes." },
      ],
    },
    footer: {
      archetype: "bold-urgency",
      businessName: "Acme Plumbing",
      phone: "5551234567",
    },
  };
}

function makeDeps(payload: R1LandingPayload | null) {
  const saved: { orgId?: string; payload?: R1LandingPayload; archetype?: string } = {};
  let saveCalls = 0;
  let revalidateCalls = 0;
  const deps: SetR1FieldDeps = {
    load: async (_orgId: string) =>
      payload ? { payload, archetype: "bold-urgency" } : null,
    save: async (orgId: string, nextPayload: R1LandingPayload, archetype: string) => {
      saveCalls += 1;
      saved.orgId = orgId;
      saved.payload = nextPayload;
      saved.archetype = archetype;
    },
    revalidate: (_orgId: string) => {
      revalidateCalls += 1;
    },
  };
  return {
    deps,
    saved,
    getSaveCalls: () => saveCalls,
    getRevalidateCalls: () => revalidateCalls,
  };
}

describe("resolveR1FieldPath", () => {
  test("hero headline/title/heading alias to tagline", () => {
    assert.equal(resolveR1FieldPath("hero", "headline"), "tagline");
    assert.equal(resolveR1FieldPath("hero", "title"), "tagline");
    assert.equal(resolveR1FieldPath("hero", "heading"), "tagline");
  });

  test("hero subheadline/subtitle alias to subhead", () => {
    assert.equal(resolveR1FieldPath("hero", "subheadline"), "subhead");
    assert.equal(resolveR1FieldPath("hero", "subtitle"), "subhead");
  });

  test("hero cta/button alias to primaryCTA.label", () => {
    assert.equal(resolveR1FieldPath("hero", "cta"), "primaryCTA.label");
    assert.equal(resolveR1FieldPath("hero", "button"), "primaryCTA.label");
  });

  test("hero passthrough for real field names", () => {
    assert.equal(resolveR1FieldPath("hero", "tagline"), "tagline");
    assert.equal(resolveR1FieldPath("hero", "primaryCTA.label"), "primaryCTA.label");
  });

  test("services/testimonials/faq title/headline alias to heading", () => {
    assert.equal(resolveR1FieldPath("services", "title"), "heading");
    assert.equal(resolveR1FieldPath("testimonials", "headline"), "heading");
    assert.equal(resolveR1FieldPath("faq", "title"), "heading");
  });

  test("other sections pass field through unchanged", () => {
    assert.equal(resolveR1FieldPath("footer", "phone"), "phone");
    assert.equal(resolveR1FieldPath("emergency", "label"), "label");
  });
});

describe("setR1Field", () => {
  test("alias: hero/headline writes payload.hero.tagline", async () => {
    const payload = basePayload();
    const { deps, saved, getSaveCalls } = makeDeps(payload);

    const result = await setR1Field("org-1", "hero", "headline", "New Headline", deps);

    assert.deepEqual(result, {
      ok: true,
      applied: { section: "hero", path: "tagline", value: "New Headline" },
    });
    assert.equal(saved.payload?.hero.tagline, "New Headline");
    assert.equal(getSaveCalls(), 1);
  });

  test("nested: hero/primaryCTA.label round-trips", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Field("org-1", "hero", "primaryCTA.label", "Book now", deps);

    assert.equal(result.ok, true);
    assert.equal(saved.payload?.hero.primaryCTA.label, "Book now");
    // href untouched.
    assert.equal(saved.payload?.hero.primaryCTA.href, "tel:5551234567");
  });

  test("nested: services/services.0.name round-trips", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Field("org-1", "services", "services.0.name", "Drain Cleaning Pro", deps);

    assert.equal(result.ok, true);
    assert.equal(saved.payload?.services.services[0].name, "Drain Cleaning Pro");
    // Other service untouched.
    assert.equal(saved.payload?.services.services[1].name, "Leak repair");
  });

  test("nested: faq/items.1.answer round-trips", async () => {
    const payload = basePayload();
    const { deps, saved } = makeDeps(payload);

    const result = await setR1Field("org-1", "faq", "items.1.answer", "Yes, fully licensed.", deps);

    assert.equal(result.ok, true);
    assert.equal(saved.payload?.faq.items[1].answer, "Yes, fully licensed.");
    // Other item untouched.
    assert.equal(saved.payload?.faq.items[0].answer, "Yes, 24/7.");
  });

  test("field_not_found: hero/nonsense fails without saving", async () => {
    const payload = basePayload();
    const { deps, getSaveCalls, getRevalidateCalls } = makeDeps(payload);

    const result = await setR1Field("org-1", "hero", "nonsense.deeply.missing", "x", deps);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "field_not_found");
    assert.equal(getSaveCalls(), 0);
    assert.equal(getRevalidateCalls(), 0);
  });

  test("field_not_found: a flat NEW key on an existing section is rejected (never-lies)", async () => {
    // hero.madeUpField is settable on the object but renders nothing — the tool
    // must NOT report success for a hallucinated field name.
    const payload = basePayload();
    const { deps, getSaveCalls, getRevalidateCalls } = makeDeps(payload);

    const result = await setR1Field("org-1", "hero", "madeUpField", "x", deps);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "field_not_found");
    assert.equal(getSaveCalls(), 0);
    assert.equal(getRevalidateCalls(), 0);
  });

  test("field_not_found: setting an absent optional nested field is rejected (use edit_site to add)", async () => {
    // hero.secondaryCTA is absent in basePayload; editing its .label must fail
    // rather than write a partial object that won't render correctly.
    const payload = basePayload();
    const { deps, getSaveCalls } = makeDeps(payload);

    const result = await setR1Field("org-1", "hero", "secondaryCTA.label", "Learn more", deps);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "field_not_found");
    assert.equal(getSaveCalls(), 0);
  });

  test("no_r1_page: load returns null", async () => {
    const { deps, getSaveCalls } = makeDeps(null);

    const result = await setR1Field("org-1", "hero", "headline", "x", deps);

    assert.deepEqual(result, { ok: false, error: "no_r1_page" });
    assert.equal(getSaveCalls(), 0);
  });

  test("unknown_section: bogus section fails", async () => {
    const payload = basePayload();
    const { deps, getSaveCalls } = makeDeps(payload);

    const result = await setR1Field(
      "org-1",
      "bogusSection" as unknown as Parameters<typeof setR1Field>[1],
      "headline",
      "x",
      deps,
    );

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "unknown_section");
    assert.equal(getSaveCalls(), 0);
  });

  test("unknown_section: valid enum value but absent on this payload (e.g. emergency)", async () => {
    const payload = basePayload(); // no `emergency` key
    const { deps, getSaveCalls } = makeDeps(payload);

    const result = await setR1Field("org-1", "emergency", "label", "24/7", deps);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "unknown_section");
    assert.equal(getSaveCalls(), 0);
  });
});
