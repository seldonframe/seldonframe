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
  extractOpenAiMeta,
  withChatGptRef,
  formatMarketplaceList,
  formatBuildResult,
  formatDeployResult,
} from "../../../src/lib/chatgpt-app/chatgpt-mcp-rpc";
import { BUILD_RESULT_WIDGET_URI, AGENT_CAROUSEL_WIDGET_URI } from "../../../src/lib/chatgpt-app/widgets";
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

  // ChatGPT app review REQUIRES impact annotations + an outputSchema on every
  // tool (omitting annotations is a validation error → rejection). Lock them in.
  test("every tool declares boolean impact annotations matching its real behavior", () => {
    const tools = buildChatGptToolsList().tools;
    const byName = (n: string) => tools.find((t) => t.name === n)!;
    for (const tool of tools) {
      assert.ok(tool.annotations, `${tool.name} is missing annotations`);
      assert.equal(typeof tool.annotations!.readOnlyHint, "boolean");
      assert.equal(typeof tool.annotations!.destructiveHint, "boolean");
      assert.equal(typeof tool.annotations!.openWorldHint, "boolean");
    }
    assert.equal(byName("browse_marketplace").annotations!.readOnlyHint, true);
    assert.equal(byName("build_workspace").annotations!.readOnlyHint, false);
    assert.equal(byName("build_workspace").annotations!.openWorldHint, true);
    assert.equal(byName("deploy_agent").annotations!.readOnlyHint, false);
    assert.equal(byName("deploy_agent").annotations!.destructiveHint, false);
  });

  test("every tool declares an object outputSchema", () => {
    for (const tool of buildChatGptToolsList().tools) {
      assert.ok(tool.outputSchema, `${tool.name} is missing outputSchema`);
      assert.equal((tool.outputSchema as { type?: string }).type, "object");
    }
  });

  // ─── v2 widgets: invocation strings + widget wiring ─────────────────────

  test("every tool declares ≤64-char openai/toolInvocation invoking + invoked strings", () => {
    const expected: Record<string, [string, string]> = {
      build_workspace: ["Building your workspace…", "Workspace live."],
      browse_marketplace: ["Browsing free agents…", "Agents found."],
      deploy_agent: ["Installing agent…", "Agent installed."],
    };
    for (const tool of buildChatGptToolsList().tools) {
      const meta = tool._meta as Record<string, unknown>;
      assert.ok(meta, `${tool.name} is missing _meta`);
      const invoking = meta["openai/toolInvocation/invoking"];
      const invoked = meta["openai/toolInvocation/invoked"];
      assert.equal(invoking, expected[tool.name][0]);
      assert.equal(invoked, expected[tool.name][1]);
      assert.ok((invoking as string).length <= 64, `${tool.name} invoking string too long`);
      assert.ok((invoked as string).length <= 64, `${tool.name} invoked string too long`);
    }
  });

  test("build_workspace + browse_marketplace wire ui.resourceUri + the openai/outputTemplate alias + a widgetDescription", () => {
    const tools = buildChatGptToolsList().tools;
    const build = tools.find((t) => t.name === "build_workspace")!;
    const browse = tools.find((t) => t.name === "browse_marketplace")!;

    const buildMeta = build._meta as Record<string, unknown>;
    assert.equal((buildMeta.ui as { resourceUri?: string }).resourceUri, BUILD_RESULT_WIDGET_URI);
    assert.equal(buildMeta["openai/outputTemplate"], BUILD_RESULT_WIDGET_URI);
    assert.ok((buildMeta["openai/widgetDescription"] as string).length > 0);

    const browseMeta = browse._meta as Record<string, unknown>;
    assert.equal((browseMeta.ui as { resourceUri?: string }).resourceUri, AGENT_CAROUSEL_WIDGET_URI);
    assert.equal(browseMeta["openai/outputTemplate"], AGENT_CAROUSEL_WIDGET_URI);
    assert.ok((browseMeta["openai/widgetDescription"] as string).length > 0);
  });

  test("build_workspace outputSchema additively gains `name` without dropping the existing required fields", () => {
    const tool = buildChatGptToolsList().tools.find((t) => t.name === "build_workspace")!;
    const schema = tool.outputSchema as { properties: Record<string, unknown>; required?: string[] };
    assert.ok("name" in schema.properties, "outputSchema should declare `name`");
    assert.deepEqual(schema.required, ["url", "workspaceToken"]);
  });

  test("deploy_agent stays text-only (no widget resourceUri) but is openai/widgetAccessible", () => {
    const tool = buildChatGptToolsList().tools.find((t) => t.name === "deploy_agent")!;
    const meta = tool._meta as Record<string, unknown>;
    assert.equal(meta["openai/widgetAccessible"], true);
    assert.equal(meta.ui, undefined);
    assert.equal(meta["openai/outputTemplate"], undefined);
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

// ─── extractOpenAiMeta ───────────────────────────────────────────────────────

describe("extractOpenAiMeta", () => {
  test("reads openai/subject + openai/session from params._meta", () => {
    const meta = extractOpenAiMeta({
      name: "build_workspace",
      arguments: { business_name: "Acme" },
      _meta: { "openai/subject": "sub_abc123", "openai/session": "sess_xyz789" },
    });
    assert.equal(meta.subject, "sub_abc123");
    assert.equal(meta.session, "sess_xyz789");
  });

  test("missing _meta → both undefined (a non-ChatGPT MCP caller)", () => {
    const meta = extractOpenAiMeta({ name: "build_workspace", arguments: {} });
    assert.equal(meta.subject, undefined);
    assert.equal(meta.session, undefined);
  });

  test("blank / non-string / non-object shapes never yield a subject", () => {
    assert.equal(extractOpenAiMeta({ _meta: { "openai/subject": "   " } }).subject, undefined);
    assert.equal(extractOpenAiMeta({ _meta: { "openai/subject": 42 } }).subject, undefined);
    assert.equal(extractOpenAiMeta({ _meta: "not-an-object" }).subject, undefined);
    assert.equal(extractOpenAiMeta({ _meta: ["openai/subject"] }).subject, undefined);
  });

  test("trims and caps runaway ids (they become rate-limit keys)", () => {
    const meta = extractOpenAiMeta({ _meta: { "openai/subject": `  ${"s".repeat(500)}  ` } });
    assert.ok(meta.subject);
    assert.ok(meta.subject!.length <= 128, "subject must be length-capped");
    assert.equal(meta.subject, "s".repeat(128));
  });
});

// ─── withChatGptRef ──────────────────────────────────────────────────────────

describe("withChatGptRef", () => {
  test("appends ref=chatgpt to a bare URL", () => {
    assert.equal(
      withChatGptRef("https://acme.app.seldonframe.com"),
      "https://acme.app.seldonframe.com/?ref=chatgpt",
    );
  });

  test("preserves existing query params (the token-bearing claim URL)", () => {
    const out = withChatGptRef("https://app.seldonframe.com/admin/org-1?token=tok_abc");
    const u = new URL(out);
    assert.equal(u.searchParams.get("token"), "tok_abc");
    assert.equal(u.searchParams.get("ref"), "chatgpt");
  });

  test("is idempotent (never stacks a second ref param)", () => {
    const once = withChatGptRef("https://app.seldonframe.com/w/acme");
    const twice = withChatGptRef(once);
    assert.equal(twice, once);
  });

  test("an unparseable URL is returned unchanged (never throws)", () => {
    assert.equal(withChatGptRef("not a url"), "not a url");
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
  test("renders a row per agent with the slug and NO price labels (free-utility surface)", () => {
    const text = formatMarketplaceList(ROWS);
    assert.match(text, /Review Requester/);
    assert.match(text, /Booking Concierge/);
    // the slug is the deploy handle — it must be present for each
    assert.match(text, /review-requester/);
    assert.match(text, /booking-concierge/);
    // free-utility contract: no price rendering of any kind, even for a row
    // that carries a nonzero legacy price column
    assert.doesNotMatch(text, /\$/);
    assert.doesNotMatch(text, /Free/);
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

  test("deploy result without a url still names the agent and stays link-free", () => {
    const text = formatDeployResult({ name: "Review Requester" });
    assert.match(text, /Review Requester/);
    assert.doesNotMatch(text, /https?:\/\//);
    assert.doesNotMatch(text, /undefined/);
  });
});
