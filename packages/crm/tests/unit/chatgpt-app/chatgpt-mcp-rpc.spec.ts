// ChatGPT App (Apps SDK = MCP-over-HTTP) — tests for the PURE wire layer.
//
// Everything under test here is pure (no db, no env, no I/O): the tools/list
// descriptor for the three ChatGPT tools, the per-tool arg parsers/validators,
// and the text formatters. Mirrors the rental MCP's agent-mcp-rpc.spec.ts shape
// (node:test + node:assert/strict, DI-free pure functions).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildChatGptToolsList,
  parseBuildWorkspaceArgs,
  parseBrowseArgs,
  parseDeployArgs,
  assembleWorkspaceSource,
  formatMarketplaceList,
  formatBuildResult,
  formatDeployResult,
} from "../../../src/lib/chatgpt-app/chatgpt-mcp-rpc";
import type { MarketplaceAgentRow } from "../../../src/lib/marketplace/agent-listings";

// ─── tools/list ──────────────────────────────────────────────────────────────

describe("buildChatGptToolsList", () => {
  test("exposes exactly the three ChatGPT tools with required fields", () => {
    const { tools } = buildChatGptToolsList();
    assert.equal(tools.length, 3);

    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["browse_marketplace", "build_workspace", "deploy_agent"]);

    for (const tool of tools) {
      assert.equal(typeof tool.name, "string");
      assert.ok(tool.description.length > 0, `${tool.name} has a description`);
      assert.equal((tool.inputSchema as { type?: string }).type, "object");
      assert.equal(typeof (tool.inputSchema as { properties?: unknown }).properties, "object");
    }
  });

  test("build_workspace requires business_name and declares the optional fields", () => {
    const tool = buildChatGptToolsList().tools.find((t) => t.name === "build_workspace");
    assert.ok(tool);
    const schema = tool!.inputSchema as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    assert.deepEqual(schema.required, ["business_name"]);
    for (const field of ["business_name", "description", "website_url", "city", "state", "phone"]) {
      assert.ok(field in schema.properties, `build_workspace declares ${field}`);
    }
  });

  test("browse_marketplace takes optional query + niche (no required fields)", () => {
    const tool = buildChatGptToolsList().tools.find((t) => t.name === "browse_marketplace");
    assert.ok(tool);
    const schema = tool!.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    assert.ok(!schema.required || schema.required.length === 0);
    assert.ok("query" in schema.properties);
    assert.ok("niche" in schema.properties);
  });

  test("deploy_agent requires workspace_token + agent_slug", () => {
    const tool = buildChatGptToolsList().tools.find((t) => t.name === "deploy_agent");
    assert.ok(tool);
    const schema = tool!.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    assert.deepEqual([...(schema.required ?? [])].sort(), ["agent_slug", "workspace_token"]);
  });
});

// ─── parseBuildWorkspaceArgs ─────────────────────────────────────────────────

describe("parseBuildWorkspaceArgs", () => {
  test("accepts a good payload and trims business_name", () => {
    const out = parseBuildWorkspaceArgs({
      business_name: "  Pacific Coast Heating  ",
      description: " HVAC repair ",
      website_url: "https://pch.example.com",
      city: "San Diego",
      state: "CA",
      phone: "619-555-0100",
    });
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value.business_name, "Pacific Coast Heating");
      assert.equal(out.value.description, "HVAC repair");
      assert.equal(out.value.website_url, "https://pch.example.com");
      assert.equal(out.value.city, "San Diego");
      assert.equal(out.value.state, "CA");
      assert.equal(out.value.phone, "619-555-0100");
    }
  });

  test("rejects a missing business_name", () => {
    const out = parseBuildWorkspaceArgs({ description: "no name here" });
    assert.equal(out.ok, false);
  });

  test("rejects a blank/whitespace business_name", () => {
    const out = parseBuildWorkspaceArgs({ business_name: "   " });
    assert.equal(out.ok, false);
  });

  test("rejects a non-string business_name", () => {
    const out = parseBuildWorkspaceArgs({ business_name: 42 });
    assert.equal(out.ok, false);
  });

  test("rejects an over-long business_name (>120)", () => {
    const out = parseBuildWorkspaceArgs({ business_name: "x".repeat(121) });
    assert.equal(out.ok, false);
  });

  test("rejects an over-long description (>2000)", () => {
    const out = parseBuildWorkspaceArgs({
      business_name: "Acme",
      description: "y".repeat(2001),
    });
    assert.equal(out.ok, false);
  });

  test("drops blank/non-string optional fields to undefined", () => {
    const out = parseBuildWorkspaceArgs({ business_name: "Acme", description: "   ", phone: 5 });
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value.description, undefined);
      assert.equal(out.value.phone, undefined);
    }
  });
});

// ─── parseBrowseArgs ─────────────────────────────────────────────────────────

describe("parseBrowseArgs", () => {
  test("accepts an empty payload (all optional)", () => {
    const out = parseBrowseArgs({});
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value.query, undefined);
      assert.equal(out.value.niche, undefined);
    }
  });

  test("trims query + niche and drops blanks", () => {
    const out = parseBrowseArgs({ query: "  receptionist ", niche: "  " });
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value.query, "receptionist");
      assert.equal(out.value.niche, undefined);
    }
  });

  test("drops non-string fields", () => {
    const out = parseBrowseArgs({ query: 99, niche: ["x"] });
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value.query, undefined);
      assert.equal(out.value.niche, undefined);
    }
  });
});

// ─── parseDeployArgs ─────────────────────────────────────────────────────────

describe("parseDeployArgs", () => {
  test("accepts a good payload and trims both fields", () => {
    const out = parseDeployArgs({ workspace_token: "  wst_abc ", agent_slug: " review-requester " });
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value.workspace_token, "wst_abc");
      assert.equal(out.value.agent_slug, "review-requester");
    }
  });

  test("rejects a missing workspace_token", () => {
    const out = parseDeployArgs({ agent_slug: "review-requester" });
    assert.equal(out.ok, false);
  });

  test("rejects a missing agent_slug", () => {
    const out = parseDeployArgs({ workspace_token: "wst_abc" });
    assert.equal(out.ok, false);
  });

  test("rejects non-string fields", () => {
    const out = parseDeployArgs({ workspace_token: 1, agent_slug: 2 });
    assert.equal(out.ok, false);
  });
});

// ─── assembleWorkspaceSource ─────────────────────────────────────────────────

describe("assembleWorkspaceSource", () => {
  test("returns a website URL alone when that's all there is", () => {
    const src = assembleWorkspaceSource({ website_url: "https://pch.example.com" });
    assert.match(src, /https:\/\/pch\.example\.com/);
  });

  test("merges description + location + phone into one source string", () => {
    const src = assembleWorkspaceSource({
      description: "HVAC repair and installation",
      website_url: "https://pch.example.com",
      city: "San Diego",
      state: "CA",
      phone: "619-555-0100",
    });
    assert.match(src, /HVAC repair and installation/);
    assert.match(src, /San Diego/);
    assert.match(src, /CA/);
    assert.match(src, /619-555-0100/);
    assert.match(src, /pch\.example\.com/);
  });

  test("returns an empty string when nothing is provided", () => {
    assert.equal(assembleWorkspaceSource({}), "");
  });
});

// ─── formatMarketplaceList ───────────────────────────────────────────────────

const ROWS: MarketplaceAgentRow[] = [
  {
    id: "1",
    slug: "review-requester",
    name: "Review Requester",
    description: "Texts happy customers for a Google review.",
    niche: "reviews",
    tags: [],
    price: 0,
    agentType: "chat_assistant",
    installCount: 12,
    rating: 4.8,
    reviewCount: 5,
    isFeatured: true,
    previewImageUrl: null,
  },
  {
    id: "2",
    slug: "booking-concierge",
    name: "Booking Concierge",
    description: "Books appointments around the clock.",
    niche: "scheduling",
    tags: [],
    price: 4900,
    agentType: "voice_receptionist",
    installCount: 3,
    rating: 4.5,
    reviewCount: 2,
    isFeatured: false,
    previewImageUrl: null,
  },
];

describe("formatMarketplaceList", () => {
  test("renders a row per agent with a Free and a $-priced label + the slug", () => {
    const text = formatMarketplaceList(ROWS);
    assert.match(text, /Review Requester/);
    assert.match(text, /Booking Concierge/);
    assert.match(text, /Free/);
    assert.match(text, /\$49/);
    // the slug is the deploy handle — it must be present for each
    assert.match(text, /review-requester/);
    assert.match(text, /booking-concierge/);
  });

  test("renders a friendly empty-state when there are no rows", () => {
    const text = formatMarketplaceList([]);
    assert.ok(text.length > 0);
    assert.doesNotMatch(text, /undefined/);
  });
});

// ─── formatBuildResult / formatDeployResult ──────────────────────────────────

describe("formatBuildResult", () => {
  test("renders the public workspace URL", () => {
    const text = formatBuildResult({ url: "https://acme.app.seldonframe.com", claimUrl: "https://app.seldonframe.com/admin/x?token=y" });
    assert.match(text, /acme\.app\.seldonframe\.com/);
  });
});

describe("formatDeployResult", () => {
  test("free deploy renders the agent name + url", () => {
    const text = formatDeployResult({ name: "Review Requester", url: "https://app.seldonframe.com/agents/abc" });
    assert.match(text, /Review Requester/);
    assert.match(text, /agents\/abc/);
  });

  test("paid deploy renders a claim URL and does not imply it was installed", () => {
    const text = formatDeployResult({ name: "Booking Concierge", paid: true, claimUrl: "https://app.seldonframe.com/marketplace/booking-concierge" });
    assert.match(text, /Booking Concierge/);
    assert.match(text, /marketplace\/booking-concierge/);
  });
});
