import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildServicePagesPrompt } from "../../../src/lib/landing/service-pages-prompt";

const services = [
  { id: "s1", name: "Greenscaping", description: "Plants and lawns." },
  { id: "s2", name: "Hardscaping", description: "Patios and walls." },
];

describe("buildServicePagesPrompt", () => {
  const p = buildServicePagesPrompt({ services, businessName: "Acme Yards", vertical: "landscaping", city: "Dallas", testimonials: [] });
  test("names every real service", () => { for (const s of services) assert.ok(p.includes(s.name)); });
  test("forbids inventing services", () => { assert.match(p, /only.*(these|listed)|do not (invent|add|fabricate)/i); });
  test("asks for the ServicePage shape", () => { assert.match(p, /summary/i); assert.match(p, /body/i); assert.match(p, /ctaLabel/i); });
});
