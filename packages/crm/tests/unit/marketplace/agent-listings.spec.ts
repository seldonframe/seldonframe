// Agent marketplace — TDD for the PURE engine helpers (no DB).
//
// Mirrors the soul engine (export-soul.ts / install-soul.ts) but for agents:
// a Studio agent_templates blueprint becomes a marketplace_listings row
// (kind:'agent'), and on install that listing is cloned back into the
// buyer's org as a fresh draft agent_templates row.
//
// Covers the three pure pieces in isolation:
//   1. mapTemplateToAgentListing  — template row + opts → listing INSERT
//   2. buildInstalledAgentTemplate — kind:'agent' listing → buyer's template args
//   3. listMarketplaceAgents       — DI'd published-agents → filtered + sorted
//
// The "use server" actions (publishAgentTemplateAction /
// installAgentListingAction) are intentionally NOT exercised here: per repo
// convention server actions are covered at the pure layer (the three helpers
// above ARE that layer — the actions are thin org-guard + db wiring over them).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  mapTemplateToAgentListing,
  buildInstalledAgentTemplate,
  listMarketplaceAgents,
  type AgentListingForBuyer,
  type MarketplaceAgentRow,
} from "../../../src/lib/marketplace/agent-listings";
import { buildDefaultTemplateBlueprint } from "../../../src/lib/agent-templates/store";
import type { AgentTemplate } from "../../../src/db/schema/agent-templates";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

// ---------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------

function fakeTemplate(over: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: "tmpl-1",
    builderOrgId: "builder-1",
    name: "Front Desk",
    slug: "front-desk",
    type: "voice_receptionist",
    blueprint: buildDefaultTemplateBlueprint("voice_receptionist"),
    status: "published",
    evalScore: 92,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

// ---------------------------------------------------------------------
// mapTemplateToAgentListing
// ---------------------------------------------------------------------

describe("mapTemplateToAgentListing", () => {
  test("maps a template + opts onto a kind:'agent' listing insert", () => {
    const template = fakeTemplate();
    const listing = mapTemplateToAgentListing(template, {
      creatorOrgId: "builder-1",
      slug: "front-desk",
      priceCents: 900,
      niche: "home-services",
      tags: ["receptionist", "voice"],
      description: "Answers your phone 24/7.",
    });

    assert.equal(listing.kind, "agent", "kind must be 'agent'");
    assert.equal(listing.creatorOrgId, "builder-1");
    assert.equal(listing.slug, "front-desk");
    assert.equal(listing.name, "Front Desk");
    assert.equal(listing.description, "Answers your phone 24/7.");
    assert.equal(listing.niche, "home-services");
    assert.deepEqual(listing.tags, ["receptionist", "voice"]);
    assert.equal(listing.price, 900, "price carries priceCents through");
    assert.equal(listing.agentType, "voice_receptionist", "agentType = template.type");
    assert.deepEqual(
      listing.agentBlueprint,
      template.blueprint,
      "agentBlueprint = template.blueprint (the thing the buyer clones)",
    );
  });

  test("seeds an inert soulPackage placeholder so the NOT NULL column is satisfied", () => {
    const listing = mapTemplateToAgentListing(fakeTemplate(), {
      creatorOrgId: "builder-1",
      slug: "front-desk",
      priceCents: 0,
      niche: "home-services",
      tags: [],
    });
    // soul_package is NOT NULL in the table; an agent listing has no soul, so
    // it gets an empty object — never read on the agent path.
    assert.deepEqual(listing.soulPackage, {});
  });

  test("free agents map to price 0; description falls back to the template name", () => {
    const listing = mapTemplateToAgentListing(fakeTemplate({ name: "Quote Bot" }), {
      creatorOrgId: "b1",
      slug: "quote-bot",
      priceCents: 0,
      niche: "quoting",
      tags: [],
    });
    assert.equal(listing.price, 0);
    // No description opt → fall back to the template's own name so the row is
    // never NULL-described in a list view.
    assert.equal(listing.description, "Quote Bot");
  });

  test("carries the chat_assistant type + its blueprint", () => {
    const bp = buildDefaultTemplateBlueprint("chat_assistant");
    const listing = mapTemplateToAgentListing(
      fakeTemplate({ type: "chat_assistant", blueprint: bp }),
      { creatorOrgId: "b1", slug: "support-bot", priceCents: 1900, niche: "support", tags: [] },
    );
    assert.equal(listing.agentType, "chat_assistant");
    assert.equal((listing.agentBlueprint as AgentBlueprint).archetype, "chat-assistant");
  });
});

// ---------------------------------------------------------------------
// buildInstalledAgentTemplate
// ---------------------------------------------------------------------

describe("buildInstalledAgentTemplate", () => {
  function fakeListing(over: Partial<AgentListingForBuyer> = {}): AgentListingForBuyer {
    return {
      id: "listing-1",
      slug: "front-desk",
      name: "Front Desk",
      kind: "agent",
      agentType: "voice_receptionist",
      agentBlueprint: buildDefaultTemplateBlueprint("voice_receptionist"),
      ...over,
    };
  }

  test("clones the listing's blueprint into a fresh DRAFT template for the buyer", () => {
    const listing = fakeListing();
    const args = buildInstalledAgentTemplate(listing, "buyer-9");

    assert.equal(args.builderOrgId, "buyer-9", "owned by the BUYER's org");
    assert.equal(args.name, "Front Desk");
    assert.equal(args.type, "voice_receptionist", "type = listing.agentType");
    assert.equal(args.status, "draft", "always lands as a draft the buyer can edit");
    assert.deepEqual(
      args.blueprint,
      listing.agentBlueprint,
      "blueprint is the SELLER's blueprint (not a fresh default — that would lose customization)",
    );
  });

  test("does not share the blueprint reference with the listing (defensive copy)", () => {
    const listing = fakeListing();
    const args = buildInstalledAgentTemplate(listing, "buyer-9");
    assert.notEqual(
      args.blueprint,
      listing.agentBlueprint,
      "must be a copy so editing the installed template can't mutate the listing",
    );
  });

  test("throws if the listing is not an agent listing", () => {
    assert.throws(
      () => buildInstalledAgentTemplate(fakeListing({ kind: "soul" }), "buyer-9"),
      /not an agent listing/,
    );
  });

  test("throws if the agent listing is missing its blueprint", () => {
    assert.throws(
      () => buildInstalledAgentTemplate(fakeListing({ agentBlueprint: null }), "buyer-9"),
      /missing.*blueprint/i,
    );
  });

  test("throws if the agent listing is missing its type", () => {
    assert.throws(
      () => buildInstalledAgentTemplate(fakeListing({ agentType: null }), "buyer-9"),
      /missing.*type/i,
    );
  });
});

// ---------------------------------------------------------------------
// listMarketplaceAgents (DI db)
// ---------------------------------------------------------------------

describe("listMarketplaceAgents", () => {
  function rows(): Promise<MarketplaceAgentRow[]> {
    return Promise.resolve([
      {
        id: "a",
        slug: "front-desk",
        name: "Front Desk",
        description: "Answers your phone",
        niche: "home-services",
        tags: ["voice"],
        price: 900,
        agentType: "voice_receptionist",
        installCount: 5,
        rating: 4.8,
        reviewCount: 3,
        isFeatured: false,
        previewImageUrl: null,
      },
      {
        id: "b",
        slug: "reactivation",
        name: "Reactivation Bot",
        description: "Wins back cold leads",
        niche: "reactivation",
        tags: ["sms"],
        price: 0,
        agentType: "chat_assistant",
        installCount: 99,
        rating: 4.2,
        reviewCount: 40,
        isFeatured: false,
        previewImageUrl: null,
      },
      {
        id: "c",
        slug: "review-getter",
        name: "Review Getter",
        description: "Asks happy customers for reviews",
        niche: "reviews",
        tags: ["email"],
        price: 1900,
        agentType: "chat_assistant",
        installCount: 10,
        rating: 5,
        reviewCount: 8,
        isFeatured: true,
        previewImageUrl: null,
      },
    ]);
  }

  function deps(captured?: { listed?: boolean }) {
    return {
      listPublishedAgents: async () => {
        if (captured) captured.listed = true;
        return rows();
      },
    };
  }

  test("returns featured first, then by installCount desc", async () => {
    const result = await listMarketplaceAgents({}, deps());
    assert.deepEqual(
      result.map((r) => r.id),
      ["c", "b", "a"],
      "featured 'c' floats to top; then 99-install 'b' before 5-install 'a'",
    );
  });

  test("filters by niche (exact)", async () => {
    const result = await listMarketplaceAgents({ niche: "reviews" }, deps());
    assert.deepEqual(result.map((r) => r.id), ["c"]);
  });

  test("filters by free-text q across name + description (case-insensitive)", async () => {
    const byName = await listMarketplaceAgents({ q: "review" }, deps());
    assert.deepEqual(byName.map((r) => r.id), ["c"]);

    const byDescription = await listMarketplaceAgents({ q: "phone" }, deps());
    assert.deepEqual(byDescription.map((r) => r.id), ["a"]);
  });

  test("featured:true keeps only featured listings", async () => {
    const result = await listMarketplaceAgents({ featured: true }, deps());
    assert.deepEqual(result.map((r) => r.id), ["c"]);
  });

  test("delegates the published+kind='agent' query to the injected dep", async () => {
    const captured: { listed?: boolean } = {};
    await listMarketplaceAgents({}, deps(captured));
    assert.equal(captured.listed, true, "must go through the DI db dep (no direct import)");
  });
});
