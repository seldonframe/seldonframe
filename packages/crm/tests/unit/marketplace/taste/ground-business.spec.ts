import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groundOnBusiness, type GroundDeps } from "../../../../src/lib/marketplace/taste/ground-business";
import { TASTE_GROUNDING_MAX_BYTES } from "../../../../src/lib/marketplace/taste/taste-policy";
import { groundingByteSize } from "../../../../src/lib/marketplace/taste/taste-session-store";

const CREATOR = "seller-org";

function makeDeps(overrides: Partial<GroundDeps> = {}): GroundDeps {
  return {
    assertUrl: async (raw: string) => ({ url: new URL(raw), ip: "203.0.113.7" }),
    fetchPage: async () => ({ markdown: "# Visitor Plumbing\nWe fix pipes in Austin.", title: "Visitor Plumbing" }),
    getClient: async () => ({
      client: {
        messages: {
          create: async () => ({
            content: [{ type: "text", text: JSON.stringify({ businessName: "Visitor Plumbing", industry: "plumbing", services: ["repairs"] }) }],
          }),
        },
      } as never,
      provider: "anthropic",
    }),
    flagshipOrgIds: new Set<string>(),
    ...overrides,
  };
}

describe("groundOnBusiness", () => {
  it("happy path: asserts, fetches, extracts, returns capped grounding with sourceDomain", async () => {
    const out = await groundOnBusiness({ url: "https://visitor.com", creatorOrgId: CREATOR }, makeDeps());
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.grounding.businessName, "Visitor Plumbing");
      assert.equal(out.grounding.sourceDomain, "visitor.com");
      assert.ok(groundingByteSize(out.grounding) <= TASTE_GROUNDING_MAX_BYTES);
    }
  });

  it("SSRF rejection maps to blocked_url (never fetches)", async () => {
    let fetched = 0;
    const out = await groundOnBusiness(
      { url: "http://169.254.169.254/", creatorOrgId: CREATOR },
      makeDeps({
        assertUrl: async () => { throw new Error("URL not allowed"); },
        fetchPage: async () => { fetched += 1; return { markdown: "", title: "" }; },
      }),
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, "blocked_url");
    assert.equal(fetched, 0);
  });

  it("platform-key non-flagship seller: refuses extraction (money invariant reaches grounding too)", async () => {
    const out = await groundOnBusiness(
      { url: "https://visitor.com", creatorOrgId: CREATOR },
      makeDeps({ getClient: async () => ({ client: { } as never, provider: "platform" }) }),
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, "no_taste_key");
  });

  it("LLM failure falls back to the no-LLM minimal grounding (title + first words)", async () => {
    const out = await groundOnBusiness(
      { url: "https://visitor.com", creatorOrgId: CREATOR },
      makeDeps({
        getClient: async () => ({
          client: { messages: { create: async () => { throw new Error("boom"); } } } as never,
          provider: "anthropic",
        }),
      }),
    );
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.grounding.businessName, "Visitor Plumbing");
  });

  it("fetch failure maps to fetch_failed", async () => {
    const out = await groundOnBusiness(
      { url: "https://visitor.com", creatorOrgId: CREATOR },
      makeDeps({ fetchPage: async () => { throw new Error("timeout"); } }),
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, "fetch_failed");
  });
});
