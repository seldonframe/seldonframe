import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateServicePages } from "../../../src/lib/landing/service-pages-generator";
import { validateSiteTree, serviceSlug } from "../../../src/lib/landing/r1-site-tree";

const gridServices = [
  { id: "s1", name: "Outdoor Structures", description: "Pergolas." },
  { id: "s2", name: "Irrigation and Drainage", description: "Sprinklers." },
];
function client(json: unknown) {
  return { messages: { create: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }] }) } };
}
const fakePhoto = async () => ({ src: "https://images.unsplash.com/p?w=1600", alt: "x" });
const facts = { business_name: "Acme", city: "Dallas", state: "TX", testimonials: [] } as never;

describe("generateServicePages", () => {
  test("one page per real service, slug = serviceSlug(name), valid + photo'd", async () => {
    const pages = await generateServicePages({
      gridServices, facts, vertical: "landscaping", archetype: "editorial-warm", byokKey: "x",
      anthropicClient: client({ servicePages: [
        { name: "Outdoor Structures", summary: "Custom builds.", body: [{ kind: "paragraph", text: "We build pergolas." }], ctaLabel: "Plan yours" },
        { name: "Irrigation and Drainage", summary: "Stay green.", body: [{ kind: "paragraph", text: "We zone systems." }], ctaLabel: "Get an estimate" },
      ] }),
      photoResolver: fakePhoto as never,
    });
    assert.equal(pages.length, 2);
    assert.equal(pages[0].slug, serviceSlug("Outdoor Structures"));
    assert.equal(pages[1].slug, serviceSlug("Irrigation and Drainage"));
    assert.ok(pages[0].heroPhoto?.src);
    const res = validateSiteTree({ servicePages: pages } as never);
    assert.equal(res.valid, true, JSON.stringify(res.errors));
  });

  test("drops any LLM service not in the real grid (no fabrication)", async () => {
    const pages = await generateServicePages({
      gridServices: [gridServices[0]], facts, vertical: "landscaping", archetype: "editorial-warm", byokKey: "x",
      anthropicClient: client({ servicePages: [
        { name: "Outdoor Structures", summary: "ok", body: [{ kind: "paragraph", text: "x" }], ctaLabel: "go" },
        { name: "Pool Installation", summary: "nope", body: [{ kind: "paragraph", text: "x" }], ctaLabel: "go" },
      ] }),
      photoResolver: fakePhoto as never,
    });
    assert.equal(pages.length, 1);
    assert.equal(pages[0].name, "Outdoor Structures");
  });

  test("returns [] gracefully on unparseable LLM output", async () => {
    const pages = await generateServicePages({
      gridServices, facts, vertical: "landscaping", archetype: "editorial-warm", byokKey: "x",
      anthropicClient: { messages: { create: async () => ({ content: [{ type: "text", text: "not json" }] }) } },
      photoResolver: fakePhoto as never,
    });
    assert.deepEqual(pages, []);
  });

  test("returns [] gracefully when the LLM call throws", async () => {
    const pages = await generateServicePages({
      gridServices, facts, vertical: "landscaping", archetype: "editorial-warm", byokKey: "x",
      anthropicClient: { messages: { create: async () => { throw new Error("rate limited"); } } },
      photoResolver: fakePhoto as never,
    });
    assert.deepEqual(pages, []);
  });
});
