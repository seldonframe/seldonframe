// Tests for generateR1Payload — specifically the photo post-process (Task 6).
//
// All tests stay OFFLINE: the anthropicClient seam returns fixture JSON,
// and resolveServicePhotoFn is always a fake. No real Anthropic or Unsplash
// calls are made.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  generateR1Payload,
  pickText,
  stripFences,
} from "../../../src/lib/landing/r1-payload-generator";
import type { AnthropicContentBlock } from "../../../src/lib/landing/r1-payload-generator";
import type { ExtractedBusinessFacts } from "../../../src/lib/web-onboarding/extraction-prompt";

// ── Minimal fixture data ──────────────────────────────────────────────────────

const FACTS: ExtractedBusinessFacts = {
  business_name: "Acme HVAC",
  business_description: "24/7 HVAC repair and installation.",
  services: ["AC Repair", "Furnace Install", "Duct Cleaning"],
  phone: "(209) 555-0100",
  city: "Stockton",
  state: "CA",
  email: null,
  address: null,
  review_rating: null,
  review_count: null,
  emergency_service: true,
  same_day: true,
};

/** Build a minimal valid R1LandingPayload JSON string. */
function makePayloadJson(services: Array<{ id: string; name: string; description?: string; photo?: { src: string; alt: string } }>) {
  return JSON.stringify({
    // A real (non-generic) hero image so the hero post-process is skipped —
    // these fixtures exercise the SERVICE resolver. The dedicated hero test
    // below overrides this with the generic fallback to exercise the hero path.
    hero: { archetype: "bold-urgency", heading: "We Fix It Fast", subheading: "24/7", emergencyService: true, heroImage: { src: "https://real.example.com/hero.jpg", alt: "Acme HVAC" } },
    services: {
      archetype: "bold-urgency",
      heading: "Our Services",
      services,
    },
    testimonials: {
      archetype: "bold-urgency",
      heading: "Reviews",
      testimonials: [{ id: "t1", quote: "Great!", name: "Jane D." }],
    },
    faq: {
      archetype: "bold-urgency",
      heading: "FAQ",
      items: [{ id: "f1", question: "Do you offer 24/7?", answer: "Yes." }],
    },
    footer: {
      archetype: "bold-urgency",
      businessName: "Acme HVAC",
      phone: "(209) 555-0100",
    },
  });
}

/** Build an AnthropicLike mock that returns a fixed JSON string. */
function makeClient(json: string) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: json }] as AnthropicContentBlock[],
        stop_reason: "end_turn",
      }),
    },
  };
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe("pickText", () => {
  test("joins text blocks with newline, outer-trims the result", () => {
    const blocks: AnthropicContentBlock[] = [
      { type: "text", text: "hello" },
      { type: "tool_use" },
      { type: "text", text: "world" },
    ];
    // Non-text blocks produce an empty string in the join, yielding "hello\n\nworld".
    // The outer .trim() strips leading/trailing whitespace but NOT internal newlines.
    assert.equal(pickText(blocks), "hello\n\nworld");
  });

  test("returns empty string when no text blocks", () => {
    assert.equal(pickText([{ type: "tool_use" }]), "");
    assert.equal(pickText([]), "");
  });
});

describe("stripFences", () => {
  test("strips ```json ... ``` fences", () => {
    const input = "```json\n{\"a\":1}\n```";
    assert.equal(stripFences(input), '{"a":1}');
  });

  test("strips plain ``` ... ``` fences", () => {
    assert.equal(stripFences("```\nhello\n```"), "hello");
  });

  test("passes through plain text unchanged", () => {
    assert.equal(stripFences('{"a":1}'), '{"a":1}');
  });
});

describe("generateR1Payload — photo post-process", () => {
  test("assigns photos via fake resolver when services have no prior photo", async () => {
    const json = makePayloadJson([
      { id: "s1", name: "AC Repair", description: "We fix AC." },
      { id: "s2", name: "Furnace Install", description: "We install furnaces." },
    ]);

    const fakePhoto = { src: "https://images.unsplash.com/fake?w=1600", alt: "AC Repair — Acme HVAC" };
    const calls: string[] = [];

    const payload = await generateR1Payload({
      facts: FACTS,
      archetype: "bold-urgency",
      byokKey: "fake-key",
      anthropicClient: makeClient(json),
      resolveServicePhotoFn: async (input) => {
        calls.push(input.serviceName);
        return fakePhoto;
      },
    });

    // Resolver was called once per service.
    assert.deepEqual(calls, ["AC Repair", "Furnace Install"]);

    // Every service now has the injected photo.
    for (const service of payload.services.services) {
      assert.deepEqual(service.photo, fakePhoto, `service ${service.name} missing photo`);
    }
  });

  test("uses the real photo src/alt already on the service as realSrc/realAlt", async () => {
    const existingPhoto = { src: "https://static.wixstatic.com/media/x/v1/fill/w_1100,h_825/x.jpg", alt: "Duct work" };
    const json = makePayloadJson([
      { id: "s1", name: "Duct Cleaning", description: "Clean ducts.", photo: existingPhoto },
    ]);

    let capturedRealSrc: string | null | undefined = undefined;

    await generateR1Payload({
      facts: FACTS,
      archetype: "bold-urgency",
      byokKey: "fake-key",
      anthropicClient: makeClient(json),
      resolveServicePhotoFn: async (input) => {
        capturedRealSrc = input.realSrc;
        return null; // return null → photo should remain as existing
      },
    });

    // The resolver received the LLM-supplied src.
    assert.equal(capturedRealSrc, existingPhoto.src);
  });

  test("leaves photo absent when resolver returns null (placeholder path)", async () => {
    const json = makePayloadJson([
      { id: "s1", name: "AC Repair", description: "We fix AC." },
    ]);

    const payload = await generateR1Payload({
      facts: FACTS,
      archetype: "bold-urgency",
      byokKey: "fake-key",
      anthropicClient: makeClient(json),
      resolveServicePhotoFn: async () => null,
    });

    // photo was absent in the payload and resolver returned null → still absent.
    assert.equal(payload.services.services[0]?.photo, undefined);
  });

  test("one failing resolver does not abort the build (catch per service)", async () => {
    const json = makePayloadJson([
      { id: "s1", name: "AC Repair", description: "We fix AC." },
      { id: "s2", name: "Furnace Install", description: "We install furnaces." },
    ]);

    const goodPhoto = { src: "https://images.unsplash.com/ok?w=1600", alt: "Furnace Install" };
    let callCount = 0;

    const payload = await generateR1Payload({
      facts: FACTS,
      archetype: "bold-urgency",
      byokKey: "fake-key",
      anthropicClient: makeClient(json),
      resolveServicePhotoFn: async (input) => {
        callCount++;
        if (input.serviceName === "AC Repair") throw new Error("Unsplash rate limit");
        return goodPhoto;
      },
    });

    // Both services were attempted.
    assert.equal(callCount, 2);

    // First service: photo absent (resolver threw, degrade silently).
    assert.equal(payload.services.services[0]?.photo, undefined);

    // Second service: photo was set normally.
    assert.deepEqual(payload.services.services[1]?.photo, goodPhoto);
  });

  test("passes the correct vertical + archetype + businessName to the resolver", async () => {
    // FACTS has services: ["AC Repair", "Furnace Install", "Duct Cleaning"] — should map to "hvac".
    const json = makePayloadJson([
      { id: "s1", name: "AC Repair", description: "We fix AC." },
    ]);

    let capturedVertical = "";
    let capturedArchetype = "";
    let capturedBusinessName = "";

    await generateR1Payload({
      facts: FACTS,
      archetype: "bold-urgency",
      byokKey: "fake-key",
      anthropicClient: makeClient(json),
      resolveServicePhotoFn: async (input) => {
        capturedVertical = input.vertical;
        capturedArchetype = input.archetype;
        capturedBusinessName = input.businessName;
        return null;
      },
    });

    assert.equal(capturedVertical, "hvac");
    assert.equal(capturedArchetype, "bold-urgency");
    assert.equal(capturedBusinessName, "Acme HVAC");
  });

  test("swaps the generic hardcoded hero fallback for a vertical/archetype image", async () => {
    // The prompt's no-photo hero fallback pins this exact Unsplash photo id for
    // every trades workspace. The generator must detect it and resolve a
    // relevant image instead.
    const genericSrc =
      "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&q=70&auto=format&fit=crop&q=professional%20worker";
    const json = JSON.stringify({
      hero: { archetype: "bold-urgency", heading: "We Fix It Fast", subheading: "24/7", emergencyService: true, heroImage: { src: genericSrc, alt: "old" } },
      services: { archetype: "bold-urgency", heading: "Our Services", services: [{ id: "s1", name: "AC Repair", description: "We fix AC." }] },
      testimonials: { archetype: "bold-urgency", heading: "Reviews", testimonials: [{ id: "t1", quote: "Great!", name: "Jane D." }] },
      faq: { archetype: "bold-urgency", heading: "FAQ", items: [{ id: "f1", question: "24/7?", answer: "Yes." }] },
      footer: { archetype: "bold-urgency", businessName: "Acme HVAC", phone: "(209) 555-0100" },
    });

    const heroPhoto = { src: "https://images.unsplash.com/hero-real?w=1600", alt: "Acme HVAC hero" };
    let heroVertical: string | null = null;

    const payload = await generateR1Payload({
      facts: FACTS,
      archetype: "bold-urgency",
      byokKey: "fake-key",
      anthropicClient: makeClient(json),
      // The hero post-process is the call with an empty serviceName (photo-less
      // service cards also pass realSrc:null, so serviceName is the discriminator).
      resolveServicePhotoFn: async (input) => {
        if (input.serviceName === "") {
          heroVertical = input.vertical;
          return heroPhoto;
        }
        return null;
      },
    });

    // Generic fallback was replaced by the resolved image, keyed to the real vertical.
    assert.equal(payload.hero.heroImage?.src, heroPhoto.src);
    assert.equal(heroVertical, "hvac");
  });

  test("throws on LLM call failure (anthropicClient seam)", async () => {
    const failClient = {
      messages: {
        create: async () => { throw Object.assign(new Error("Network error"), { status: 500 }); },
      },
    };

    await assert.rejects(
      () => generateR1Payload({
        facts: FACTS,
        archetype: "bold-urgency",
        byokKey: "fake-key",
        anthropicClient: failClient,
      }),
      /r1_payload_generation_failed/,
    );
  });

  test("throws on malformed JSON from LLM", async () => {
    const badClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "not json at all {{{" }] as AnthropicContentBlock[],
        }),
      },
    };

    await assert.rejects(
      () => generateR1Payload({
        facts: FACTS,
        archetype: "bold-urgency",
        byokKey: "fake-key",
        anthropicClient: badClient,
        resolveServicePhotoFn: async () => null,
      }),
      /r1_payload_generation_failed/,
    );
  });

  test("throws on model _error signal", async () => {
    const errorClient = makeClient(JSON.stringify({ _error: "generation_failed" }));

    await assert.rejects(
      () => generateR1Payload({
        facts: FACTS,
        archetype: "bold-urgency",
        byokKey: "fake-key",
        anthropicClient: errorClient,
        resolveServicePhotoFn: async () => null,
      }),
      /model signaled _error/,
    );
  });
});
