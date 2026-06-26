// Marketplace Markdown renderer — pure, fed the SAME StorefrontAgent view-model
// the HTML pages render. These tests lock the clean output shape (H1 + intro +
// agent list for the index; H1 name + what-it-does + channels/pricing + link for
// a listing) and the single-source-of-truth guarantees (no fabricated data,
// honest "New"/"Free", absolute links).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  renderMarketplaceIndexMarkdown,
  renderListingMarkdown,
} from "../../../src/lib/marketplace/render-markdown";
import type { StorefrontAgent } from "../../../src/components/marketplace/marketplace-data";

/** Minimal StorefrontAgent fixture (override only the fields a test cares about). */
function agent(overrides: Partial<StorefrontAgent> = {}): StorefrontAgent {
  return {
    slug: "ai-receptionist",
    name: "AI Receptionist",
    category: "Receptionist",
    icon: "phone",
    surfaces: ["voice", "sms"],
    installs: 0,
    rating: "0",
    reviewCount: 0,
    priceCents: 2900,
    featured: true,
    builder: "Northlight Ops",
    verified: true,
    tagline: "Answers every call and books the job — even at 2am.",
    blurb: "Picks up on the first ring, answers questions, captures the lead, and books straight into your calendar.",
    highlights: ["Never sends a caller to voicemail", "Books directly into your calendar"],
    tools: [{ label: "Calendar", icon: "calendar" }],
    sampleChannel: "phone call",
    channelIcon: "phone",
    sampleTitle: "Inbound call",
    sample: [],
    outcome: "Booked a $420 service call",
    reviews: [],
    isSeed: true,
    ...overrides,
  };
}

const BASE = "https://app.seldonframe.com";

describe("renderMarketplaceIndexMarkdown", () => {
  test("renders H1, intro, and one bullet per agent with name + tagline + link", () => {
    const md = renderMarketplaceIndexMarkdown([
      agent({ slug: "ai-receptionist", name: "AI Receptionist", tagline: "Answers every call." }),
      agent({ slug: "review-requester", name: "Review Requester", tagline: "Turns jobs into reviews." }),
    ]);

    assert.match(md, /^# SeldonFrame Agent Marketplace/);
    assert.match(md, /Vetted AI agents/);
    assert.match(md, /## Agents \(2\)/);
    assert.match(
      md,
      /- \[AI Receptionist\]\(https:\/\/app\.seldonframe\.com\/marketplace\/ai-receptionist\) — Answers every call\./,
    );
    assert.match(
      md,
      /- \[Review Requester\]\(https:\/\/app\.seldonframe\.com\/marketplace\/review-requester\) — Turns jobs into reviews\./,
    );
    assert.match(md, /Browse the full marketplace: https:\/\/app\.seldonframe\.com\/marketplace/);
  });

  test("preserves the caller's order (does not re-sort)", () => {
    const md = renderMarketplaceIndexMarkdown([
      agent({ slug: "b", name: "Bravo", featured: false }),
      agent({ slug: "a", name: "Alpha", featured: true }),
    ]);
    const bravoAt = md.indexOf("Bravo");
    const alphaAt = md.indexOf("Alpha");
    assert.ok(bravoAt > 0 && alphaAt > 0);
    assert.ok(bravoAt < alphaAt, "Bravo should appear before Alpha (input order preserved)");
  });

  test("empty catalog renders a clean, non-broken placeholder", () => {
    const md = renderMarketplaceIndexMarkdown([]);
    assert.match(md, /^# SeldonFrame Agent Marketplace/);
    assert.match(md, /No agents are published yet\./);
    assert.doesNotMatch(md, /## Agents/);
  });

  test("an agent with no tagline still lists cleanly (name + link only)", () => {
    const md = renderMarketplaceIndexMarkdown([agent({ slug: "x", name: "X", tagline: "  " })]);
    assert.match(md, /- \[X\]\(https:\/\/app\.seldonframe\.com\/marketplace\/x\)\n/);
  });

  test("honors a custom base URL", () => {
    const md = renderMarketplaceIndexMarkdown([agent({ slug: "x", name: "X" })], "https://staging.example.com/");
    assert.match(md, /\(https:\/\/staging\.example\.com\/marketplace\/x\)/);
    assert.doesNotMatch(md, /app\.seldonframe\.com/);
  });
});

describe("renderListingMarkdown", () => {
  test("renders H1 name, blockquote tagline, what-it-does, details, and link", () => {
    const md = renderListingMarkdown(
      agent({
        slug: "ai-receptionist",
        name: "AI Receptionist",
        tagline: "Answers every call.",
        blurb: "Picks up on the first ring and books the job.",
        priceCents: 2900,
        surfaces: ["voice", "sms"],
        category: "Receptionist",
        builder: "Northlight Ops",
      }),
    );

    assert.match(md, /^# AI Receptionist/);
    assert.match(md, /^> Answers every call\./m);
    assert.match(md, /## What it does/);
    assert.match(md, /Picks up on the first ring and books the job\./);
    assert.match(md, /## Details/);
    assert.match(md, /\*\*Category:\*\* Receptionists/);
    assert.match(md, /\*\*Channels:\*\* Voice \+ SMS/);
    assert.match(md, /\*\*Pricing:\*\* \$29\/mo/);
    assert.match(md, /\*\*Built by:\*\* Northlight Ops/);
    assert.match(
      md,
      /Install or learn more: https:\/\/app\.seldonframe\.com\/marketplace\/ai-receptionist/,
    );
  });

  test("free agent renders 'Free' pricing", () => {
    const md = renderListingMarkdown(agent({ priceCents: 0 }));
    assert.match(md, /\*\*Pricing:\*\* Free/);
  });

  test("priceLabelOverride wins over derived price (metered models)", () => {
    const md = renderListingMarkdown(agent({ priceCents: 0, priceLabelOverride: "$2 per call" }));
    assert.match(md, /\*\*Pricing:\*\* \$2 per call/);
    assert.doesNotMatch(md, /\*\*Pricing:\*\* Free/);
  });

  test("a brand-new seed reads 'New' for installs (no fabricated count)", () => {
    const md = renderListingMarkdown(agent({ isSeed: true, installs: 0 }));
    assert.match(md, /\*\*Installs:\*\* New/);
  });

  test("a real installed listing shows its real install count", () => {
    const md = renderListingMarkdown(agent({ isSeed: false, installs: 1240 }));
    assert.match(md, /\*\*Installs:\*\* 1,240 installed/);
  });

  test("highlights are rendered as a bullet list when present", () => {
    const md = renderListingMarkdown(
      agent({ highlights: ["Never voicemails", "Books on calendar"] }),
    );
    assert.match(md, /- Never voicemails/);
    assert.match(md, /- Books on calendar/);
  });

  test("no highlights → no empty bullet section, still renders the rest", () => {
    const md = renderListingMarkdown(agent({ highlights: [] }));
    assert.match(md, /## What it does/);
    assert.match(md, /## Details/);
  });

  test("missing blurb falls back to the tagline so What-it-does is never empty", () => {
    const md = renderListingMarkdown(agent({ blurb: "  ", tagline: "Answers every call." }));
    assert.match(md, /## What it does\n\nAnswers every call\./);
  });

  test("chat/email agent shows the right channels", () => {
    const md = renderListingMarkdown(agent({ surfaces: ["chat", "email"], category: "Support" }));
    assert.match(md, /\*\*Channels:\*\* Chat \+ Email/);
    assert.match(md, /\*\*Category:\*\* Support/);
  });
});
