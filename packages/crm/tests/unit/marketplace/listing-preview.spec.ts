// Agent marketplace — live publish PREVIEW view-model (pure).
//
// The seller's "List on the marketplace" panel renders the real marketplace
// AgentCard from the form state via buildPreviewStorefrontAgent, so the preview
// is exactly what the published listing will look like. These tests lock the
// derivation (niche→category, type→surfaces, free/paid price, honest "New").

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPreviewStorefrontAgent,
  priceLabel,
  installsLabel,
  CATEGORY_META,
} from "../../../src/components/marketplace/marketplace-data";

describe("buildPreviewStorefrontAgent", () => {
  test("voice template → voice + sms surfaces, phone channel", () => {
    const a = buildPreviewStorefrontAgent({
      name: "Front Desk",
      priceCents: 0,
      niche: "receptionist",
      agentType: "voice_receptionist",
      description: "Answers every call",
      builder: "Acme",
    });
    assert.deepEqual(a.surfaces, ["voice", "sms"]);
    assert.equal(a.channelIcon, "phone");
    assert.equal(a.category, "Receptionist");
    assert.equal(a.icon, CATEGORY_META.Receptionist.icon);
    assert.equal(a.tagline, "Answers every call");
    assert.equal(a.builder, "Acme");
  });

  test("chat template → chat + email surfaces", () => {
    const a = buildPreviewStorefrontAgent({
      name: "Reviews Bot",
      priceCents: 4900,
      niche: "reviews",
      agentType: "chat_assistant",
      description: "",
      builder: "",
    });
    assert.deepEqual(a.surfaces, ["chat", "email"]);
    assert.equal(a.category, "Reviews");
    // Empty builder falls back rather than rendering blank.
    assert.equal(a.builder, "A SeldonFrame builder");
    // Empty description → an honest default tagline, never empty.
    assert.match(a.tagline, /Reviews Bot/);
  });

  test("price flows through to priceLabel (free vs paid)", () => {
    const free = buildPreviewStorefrontAgent({
      name: "X", priceCents: 0, niche: "support", agentType: "chat_assistant", description: "", builder: "B",
    });
    const paid = buildPreviewStorefrontAgent({
      name: "Y", priceCents: 2900, niche: "support", agentType: "chat_assistant", description: "", builder: "B",
    });
    assert.equal(free.priceCents, 0);
    assert.equal(priceLabel(free.priceCents), "Free");
    assert.equal(paid.priceCents, 2900);
    assert.equal(priceLabel(paid.priceCents), "$29/mo");
  });

  test("brand-new draft reads 'New' (no fabricated installs/rating)", () => {
    const a = buildPreviewStorefrontAgent({
      name: "Z", priceCents: 0, niche: "support", agentType: "chat_assistant", description: "", builder: "B",
    });
    assert.equal(a.installs, 0);
    assert.equal(a.isSeed, false);
    assert.equal(installsLabel(a), "New");
  });

  test("existing listing's installs surface in the preview", () => {
    const a = buildPreviewStorefrontAgent({
      name: "Z", priceCents: 0, niche: "support", agentType: "chat_assistant",
      description: "", builder: "B", installCount: 37,
    });
    assert.equal(a.installs, 37);
    assert.equal(installsLabel(a), "37 installed");
  });

  test("empty name falls back so the card never renders blank", () => {
    const a = buildPreviewStorefrontAgent({
      name: "   ", priceCents: 0, niche: "support", agentType: "chat_assistant", description: "", builder: "B",
    });
    assert.equal(a.name, "Your agent");
  });

  test("negative price clamps to 0 (free)", () => {
    const a = buildPreviewStorefrontAgent({
      name: "Z", priceCents: -500, niche: "support", agentType: "chat_assistant", description: "", builder: "B",
    });
    assert.equal(a.priceCents, 0);
  });
});
