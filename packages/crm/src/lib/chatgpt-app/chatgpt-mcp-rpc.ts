// ChatGPT App (Apps SDK = MCP-over-HTTP) — the PURE wire layer.
//
// The /api/chatgpt/mcp endpoint exposes SeldonFrame to ChatGPT as a public,
// keyless MCP-over-HTTP server. It speaks the SAME JSON-RPC 2.0 / Streamable-
// HTTP shape as the agent-marketplace rental endpoint (lib/marketplace/
// agent-mcp-rpc.ts) — we IMPORT that file's envelope builders rather than
// duplicate them, so there is one transport spelling across the codebase.
//
// This file is the ChatGPT-SCOPED parallel of agent-mcp-rpc's tool descriptors
// + arg extraction + result shaping. It is pure (no db, no env, no I/O):
//   - buildChatGptToolsList()  → the three ChatGPT tools (real inputSchemas)
//   - parse{BuildWorkspace,Browse,Deploy}Args → validate + trim + cap lengths
//   - assembleWorkspaceSource() → fold the build args into one `source` string
//   - format{MarketplaceList,BuildResult,DeployResult} → human-readable text
//
// The DI handler (chatgpt-mcp-handler.ts) wires these to deps; the route
// (app/api/chatgpt/mcp/route.ts) binds the real functions.

import type { McpToolDescriptor } from "@/lib/agents/mcp/client";
import type { MarketplaceAgentRow } from "@/lib/marketplace/agent-listings";

// Re-export the transport envelope builders we share with the rental MCP, so
// the handler can import the whole wire vocabulary from one ChatGPT module.
export {
  parseJsonRpcRequest,
  jsonRpcResult,
  jsonRpcError,
  toolTextResult,
  buildInitializeResult,
  MCP_PROTOCOL_VERSION,
  JSONRPC_PARSE_ERROR,
  JSONRPC_INVALID_REQUEST,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_INTERNAL_ERROR,
  type JsonRpcId,
} from "@/lib/marketplace/agent-mcp-rpc";

// ─── tool names ──────────────────────────────────────────────────────────────

export const BUILD_WORKSPACE_TOOL = "build_workspace";
export const BROWSE_MARKETPLACE_TOOL = "browse_marketplace";
export const DEPLOY_AGENT_TOOL = "deploy_agent";

/** The three tool names this server exposes (the only valid tools/call names). */
export const CHATGPT_TOOL_NAMES = [
  BUILD_WORKSPACE_TOOL,
  BROWSE_MARKETPLACE_TOOL,
  DEPLOY_AGENT_TOOL,
] as const;

export type ChatGptToolName = (typeof CHATGPT_TOOL_NAMES)[number];

// Length caps (defensive — these args seed a workspace Soul, so cap free text).
const MAX_BUSINESS_NAME = 120;
const MAX_DESCRIPTION = 2000;
const MAX_GENERIC = 500;

// ─── tools/list ──────────────────────────────────────────────────────────────

/** A ChatGPT/Apps-SDK tool descriptor: the shared MCP shape PLUS the two fields
 *  the ChatGPT app-submission review REQUIRES — `annotations` (the read-only /
 *  destructive / open-world impact hints; omitting them is a validation error)
 *  and `outputSchema` (the exact shape of the structuredContent each tool
 *  returns). */
export type ChatGptToolDescriptor = McpToolDescriptor & {
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
    idempotentHint?: boolean;
  };
  outputSchema?: Record<string, unknown>;
};

/**
 * The `tools/list` result: the three ChatGPT tools with real MCP inputSchemas,
 * impact `annotations` (required for ChatGPT app review), and an `outputSchema`
 * describing the structuredContent each returns. Descriptions are written for an
 * LLM caller (ChatGPT) — each leads with a USE-WHEN so the model knows when to
 * reach for it.
 */
export function buildChatGptToolsList(): { tools: ChatGptToolDescriptor[] } {
  return {
    tools: [
      {
        name: BUILD_WORKSPACE_TOOL,
        description:
          "Create a complete SeldonFrame front office (public website + booking page + " +
          "intake form + CRM + AI chatbot) for a local service business, hosted on a real " +
          "subdomain. USE-WHEN the user asks to build, set up, or launch a website or " +
          "business system for their company. Returns the live public URL plus a private " +
          "workspace_token to pass to deploy_agent later in this same chat. No account or " +
          "signup needed.",
        inputSchema: {
          type: "object",
          properties: {
            business_name: {
              type: "string",
              description: "The business name (e.g. 'Pacific Coast Heating'). Required.",
            },
            description: {
              type: "string",
              description:
                "What the business does, in plain language — services offered, who it serves. " +
                "Seeds the website copy. Optional but strongly recommended.",
            },
            website_url: {
              type: "string",
              description:
                "An existing website URL, if the business has one. Used as a source to ground the workspace. Optional.",
            },
            city: { type: "string", description: "City the business operates in. Optional (helps set the timezone)." },
            state: { type: "string", description: "State/region the business operates in. Optional." },
            phone: { type: "string", description: "Public phone number. Optional." },
          },
          required: ["business_name"],
        },
        // Writes (creates a workspace) + publishes a publicly-visible website →
        // openWorldHint:true so ChatGPT summarizes the impact before acting.
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        outputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The live public URL of the new workspace." },
            workspaceToken: {
              type: "string",
              description: "Private token to pass to deploy_agent later in this conversation.",
            },
            claimUrl: {
              type: "string",
              description: "Link to manage/claim the workspace (no signup, 7-day expiry).",
            },
          },
          required: ["url", "workspaceToken"],
        },
      },
      {
        name: BROWSE_MARKETPLACE_TOOL,
        description:
          "List AI agents available to add to a SeldonFrame workspace (e.g. receptionist, " +
          "review-requester, booking concierge, lead-qualifier). USE-WHEN the user wants to " +
          "see what agents they can add, or asks for an agent that does a specific job. " +
          "Returns each agent's name, what it does, its price, and its slug — pass the slug " +
          "to deploy_agent to install it.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Free-text search across agent names + descriptions (e.g. 'reviews', 'answer the phone'). Optional.",
            },
            niche: {
              type: "string",
              description: "Filter to one category (e.g. 'home-services', 'reviews', 'scheduling'). Optional.",
            },
          },
        },
        // Read-only: lists agents, changes nothing.
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        outputSchema: {
          type: "object",
          properties: {
            agents: {
              type: "array",
              description: "The matching marketplace agents.",
              items: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  name: { type: "string" },
                  description: { type: ["string", "null"] },
                  niche: { type: "string" },
                  price: { type: "number", description: "Price in cents; 0 = free." },
                },
                required: ["slug", "name", "price"],
              },
            },
          },
          required: ["agents"],
        },
      },
      {
        name: DEPLOY_AGENT_TOOL,
        description:
          "Install a marketplace agent into a workspace you built earlier in this chat. " +
          "USE-WHEN the user picks an agent (by slug, from browse_marketplace) to add to " +
          "their workspace. Pass the workspace_token returned by build_workspace and the " +
          "agent's slug. Free agents are installed immediately; paid agents return a link to " +
          "complete the purchase (this tool never charges a card).",
        inputSchema: {
          type: "object",
          properties: {
            workspace_token: {
              type: "string",
              description: "The workspace_token returned by build_workspace earlier in this conversation. Required.",
            },
            agent_slug: {
              type: "string",
              description: "The agent's slug (from browse_marketplace), e.g. 'review-requester'. Required.",
            },
          },
          required: ["workspace_token", "agent_slug"],
        },
        // Writes into the caller's OWN workspace (bounded to our product, not
        // arbitrary URLs) and never charges → openWorld + destructive both false.
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        outputSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean", description: "Whether the install resolved (false carries a friendly error)." },
            name: { type: "string" },
            url: { type: "string", description: "Where to manage the workspace after a free install." },
            paid: { type: "boolean", description: "True when the agent is paid (returned a claim link, not installed)." },
            claimUrl: { type: "string", description: "Purchase link for a paid agent." },
            error: { type: "string" },
          },
          required: ["ok"],
        },
      },
    ],
  };
}

// ─── arg parsing / validation ────────────────────────────────────────────────

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

/** Trim a value to a non-empty string, or undefined when blank/non-string. */
function optionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type BuildWorkspaceArgs = {
  business_name: string;
  description?: string;
  website_url?: string;
  city?: string;
  state?: string;
  phone?: string;
};

/** Validate + normalize the build_workspace arguments. */
export function parseBuildWorkspaceArgs(args: Record<string, unknown>): ParseResult<BuildWorkspaceArgs> {
  const rawName = args.business_name;
  if (typeof rawName !== "string" || rawName.trim().length === 0) {
    return { ok: false, error: "`business_name` (a non-empty string) is required." };
  }
  const business_name = rawName.trim();
  if (business_name.length > MAX_BUSINESS_NAME) {
    return { ok: false, error: `\`business_name\` must be ${MAX_BUSINESS_NAME} characters or fewer.` };
  }

  const description = optionalString(args.description);
  if (description && description.length > MAX_DESCRIPTION) {
    return { ok: false, error: `\`description\` must be ${MAX_DESCRIPTION} characters or fewer.` };
  }

  const website_url = optionalString(args.website_url);
  if (website_url && website_url.length > MAX_GENERIC) {
    return { ok: false, error: `\`website_url\` must be ${MAX_GENERIC} characters or fewer.` };
  }

  return {
    ok: true,
    value: {
      business_name,
      description,
      website_url,
      city: optionalString(args.city),
      state: optionalString(args.state),
      phone: optionalString(args.phone),
    },
  };
}

export type BrowseArgs = { query?: string; niche?: string };

/** Validate + normalize the browse_marketplace arguments (all optional). */
export function parseBrowseArgs(args: Record<string, unknown>): ParseResult<BrowseArgs> {
  return {
    ok: true,
    value: {
      query: optionalString(args.query),
      niche: optionalString(args.niche),
    },
  };
}

export type DeployArgs = { workspace_token: string; agent_slug: string };

/** Validate + normalize the deploy_agent arguments. */
export function parseDeployArgs(args: Record<string, unknown>): ParseResult<DeployArgs> {
  const rawToken = args.workspace_token;
  if (typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return { ok: false, error: "`workspace_token` (a non-empty string) is required — build a workspace first." };
  }
  const rawSlug = args.agent_slug;
  if (typeof rawSlug !== "string" || rawSlug.trim().length === 0) {
    return { ok: false, error: "`agent_slug` (a non-empty string) is required — pick one from browse_marketplace." };
  }
  return { ok: true, value: { workspace_token: rawToken.trim(), agent_slug: rawSlug.trim() } };
}

// ─── source assembly ─────────────────────────────────────────────────────────

/**
 * Fold the build_workspace fields into a single `source` string for
 * createAnonymousWorkspace. `source` accepts either a URL or a free-form
 * description; the anonymous path seeds the workspace Soul from it (NO LLM
 * call). We concatenate description + location + phone + website so a single
 * sentence-or-URL captures everything the caller gave us. Returns "" when
 * nothing was provided (the anonymous path then falls back to the legacy seed).
 */
export function assembleWorkspaceSource(input: {
  description?: string;
  website_url?: string;
  city?: string;
  state?: string;
  phone?: string;
}): string {
  const parts: string[] = [];
  if (input.description) parts.push(input.description);

  const location =
    input.city && input.state
      ? `${input.city}, ${input.state}`
      : input.city || input.state || "";
  if (location) parts.push(`Location: ${location}`);
  if (input.phone) parts.push(`Phone: ${input.phone}`);
  if (input.website_url) parts.push(`Website: ${input.website_url}`);

  return parts.join(". ").trim();
}

// ─── formatters ──────────────────────────────────────────────────────────────

/** Render a price in cents as a buyer-facing label. 0 → "Free". */
export function priceLabel(cents: number): string {
  if (!cents || cents <= 0) return "Free";
  const dollars = cents / 100;
  // Whole-dollar prices show without cents; otherwise two decimals.
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Render a list of marketplace agents as a readable, LLM-friendly block. */
export function formatMarketplaceList(rows: MarketplaceAgentRow[]): string {
  if (rows.length === 0) {
    return "No agents matched. Try a broader search, or build a workspace first with build_workspace.";
  }
  const lines = rows.map((row) => {
    const desc = (row.description ?? "").trim();
    const blurb = desc ? ` — ${desc}` : "";
    return `• ${row.name}${blurb}\n  ${row.niche} · ${priceLabel(row.price)} · slug: ${row.slug}`;
  });
  return `${rows.length} agent${rows.length === 1 ? "" : "s"} available:\n\n${lines.join("\n\n")}\n\nTo add one, call deploy_agent with its slug and your workspace_token.`;
}

/** Render the build_workspace success message (leads with the live URL). */
export function formatBuildResult(input: { url: string; claimUrl?: string }): string {
  const lines = [
    `Your workspace is live: ${input.url}`,
    "",
    "It includes a public website, booking page, intake form, CRM, and chatbot.",
  ];
  if (input.claimUrl) {
    lines.push(`Manage it here (no signup, link expires in 7 days): ${input.claimUrl}`);
  }
  lines.push(
    "Next, browse_marketplace to see AI agents you can add — then deploy_agent with the workspace_token from this result.",
  );
  return lines.join("\n");
}

/** Render the deploy_agent result for the free (installed) or paid (claim) branch. */
export function formatDeployResult(input: {
  name: string;
  url?: string;
  paid?: boolean;
  claimUrl?: string;
}): string {
  if (input.paid) {
    return (
      `"${input.name}" is a paid agent, so it wasn't installed automatically. ` +
      `Complete the purchase to add it to your workspace: ${input.claimUrl ?? ""}`.trimEnd()
    );
  }
  const where = input.url ? ` Manage it here: ${input.url}` : "";
  return `Installed "${input.name}" into your workspace.${where}`;
}
