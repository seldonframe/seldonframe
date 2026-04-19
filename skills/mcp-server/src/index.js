#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WELCOME_MARKDOWN } from "./welcome.js";
import * as guest from "./guest/runtime.js";

const API_BASE =
  process.env.SELDONFRAME_API_BASE ?? "https://app.seldonframe.com/api/v1";
const API_KEY = process.env.SELDONFRAME_API_KEY;
const MODE = API_KEY ? "connected" : "guest";

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "seldonframe-mcp/1.7.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? text ?? res.statusText;
    const hint =
      res.status === 401
        ? ` — your SELDONFRAME_API_KEY may be invalid. Get a new one at https://app.seldonframe.com/settings/api.`
        : "";
    throw new Error(`Seldon API ${res.status}: ${msg}${hint}`);
  }
  return data;
}

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const obj = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const TOOLS = [
  {
    name: "create_workspace",
    description:
      "Create a new workspace (CRM + pipelines + Soul seeded). Example: create_workspace({name:'My OS', source:'https://mysite.com'})",
    inputSchema: obj(
      {
        name: str("Human-readable workspace name."),
        source: str("Optional URL or free-text description to seed the workspace from."),
      },
      ["name"],
    ),
    call: (a) => api("POST", "/workspace/create", a),
  },
  {
    name: "list_workspaces",
    description: "List workspaces you own (connected mode) or all guest workspaces on this machine.",
    inputSchema: obj({}),
    call: () => api("GET", "/workspaces"),
  },
  {
    name: "switch_workspace",
    description: "Set the active workspace. Subsequent tool calls act on it.",
    inputSchema: obj({ workspace_id: str("Target workspace id.") }, ["workspace_id"]),
    call: (a) => api("POST", `/workspaces/${encodeURIComponent(a.workspace_id)}/activate`),
  },
  {
    name: "clone_workspace",
    description:
      "Clone an existing workspace as a template. Example: clone_workspace({source_workspace_id:'wsp_x', name:'Copy'})",
    inputSchema: obj(
      {
        source_workspace_id: str("Workspace to clone from."),
        name: str("Name for the new workspace."),
      },
      ["source_workspace_id", "name"],
    ),
    call: (a) =>
      api("POST", `/workspaces/${encodeURIComponent(a.source_workspace_id)}/clone`, {
        name: a.name,
      }),
  },
  {
    name: "seldon_it",
    description:
      "Natural-language command — generate, install, or modify anything in the active workspace. Example: seldon_it({prompt:'add a lead-magnet landing page'})",
    inputSchema: obj(
      {
        prompt: str("What you want Seldon to do, in plain language."),
        workspace_id: str("Optional override — defaults to active workspace."),
      },
      ["prompt"],
    ),
    call: (a) => api("POST", "/seldon-it", a),
  },
  {
    name: "list_automations",
    description: "List automations configured in the active (or specified) workspace.",
    inputSchema: obj({ workspace_id: str("Optional workspace override.") }),
    call: (a) => {
      const q = a.workspace_id ? `?workspace_id=${encodeURIComponent(a.workspace_id)}` : "";
      return api("GET", `/automations${q}`);
    },
  },
  {
    name: "install_vertical_pack",
    description:
      "Install a vertical pack (e.g. 'real-estate'). Adds domain-specific objects, fields, views. Example: install_vertical_pack({pack:'real-estate'})",
    inputSchema: obj(
      {
        pack: str("Pack slug, e.g. 'real-estate', 'dental', 'legal'."),
        workspace_id: str("Optional workspace override."),
      },
      ["pack"],
    ),
    call: (a) => api("POST", "/packs/install", a),
  },
  {
    name: "install_caldiy_booking",
    description:
      "Install the Cal.diy booking block (event types, availability, bookings). Example: install_caldiy_booking({})",
    inputSchema: obj(
      {
        workspace_id: str("Optional workspace override."),
        config: { type: "object", description: "Optional Cal.diy configuration overrides." },
      },
    ),
    call: (a) => api("POST", "/packs/caldiy-booking/install", a),
  },
  {
    name: "install_formbricks_intake",
    description:
      "Install a Formbricks intake form (surveys, conditional logic, contact sync). Example: install_formbricks_intake({})",
    inputSchema: obj(
      {
        workspace_id: str("Optional workspace override."),
        form_id: str("Optional existing Formbricks form id to bind."),
      },
    ),
    call: (a) => api("POST", "/packs/formbricks-intake/install", a),
  },
  {
    name: "query_brain",
    description:
      "Ask Brain v2 for insights about the workspace. Example: query_brain({question:'what should I do first?'})",
    inputSchema: obj(
      {
        question: str("The question to ask Brain."),
        workspace_id: str("Optional workspace override."),
      },
      ["question"],
    ),
    call: (a) => api("POST", "/brain/query", a),
  },
  {
    name: "connect_custom_domain",
    description: "Connect + verify a custom domain. Example: connect_custom_domain({domain:'app.mysite.com'})",
    inputSchema: obj(
      {
        domain: str("Fully qualified domain, e.g. client.example.com."),
        workspace_id: str("Optional workspace override."),
      },
      ["domain"],
    ),
    call: (a) => api("POST", "/domains/connect", a),
  },
  {
    name: "export_agent",
    description: "Export the current workspace as a portable .agent/ bundle.",
    inputSchema: obj({ workspace_id: str("Optional workspace override.") }),
    call: (a) => api("POST", "/export/agent", a),
  },
  {
    name: "store_secret",
    description:
      "Store a workspace-scoped secret (encrypted at rest in connected mode). Example: store_secret({key:'STRIPE_API_KEY', value:'sk_...'})",
    inputSchema: obj(
      {
        key: str("Secret name, e.g. 'STRIPE_API_KEY'."),
        value: str("Secret plaintext value."),
        workspace_id: str("Optional workspace override."),
      },
      ["key", "value"],
    ),
    call: (a) => api("POST", "/secrets", a),
  },
  {
    name: "list_secrets",
    description: "List secret metadata (names, timestamps) without exposing plaintext.",
    inputSchema: obj({ workspace_id: str("Optional workspace override.") }),
    call: (a) => {
      const q = a.workspace_id ? `?workspace_id=${encodeURIComponent(a.workspace_id)}` : "";
      return api("GET", `/secrets${q}`);
    },
  },
  {
    name: "rotate_secret",
    description: "Rotate or delete a workspace secret. Omit new_value to delete.",
    inputSchema: obj(
      {
        key: str("Secret name to rotate."),
        new_value: str("New plaintext value. Omit to delete the secret."),
        workspace_id: str("Optional workspace override."),
      },
      ["key"],
    ),
    call: (a) =>
      a.new_value === undefined
        ? api("DELETE", `/secrets/${encodeURIComponent(a.key)}`, { workspace_id: a.workspace_id })
        : api("PUT", `/secrets/${encodeURIComponent(a.key)}`, {
            value: a.new_value,
            workspace_id: a.workspace_id,
          }),
  },
  {
    name: "claim_guest_workspace",
    description:
      "Promote a local guest workspace to app.seldonframe.com. Writes a claim file you can upload or email to support. Example: claim_guest_workspace({})",
    inputSchema: obj({
      workspace_id: str("Guest workspace id. Defaults to the active guest workspace."),
    }),
    call: () => {
      throw new Error(
        "claim_guest_workspace is only meaningful in guest mode (SELDONFRAME_API_KEY not set). In connected mode, workspaces already persist to app.seldonframe.com.",
      );
    },
  },
];

const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const server = new Server(
  { name: "seldonframe", version: "1.7.0" },
  {
    capabilities: { tools: {} },
    instructions: WELCOME_MARKDOWN,
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOL_MAP[req.params.name];
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
    };
  }
  try {
    const args = req.params.arguments ?? {};
    const result =
      MODE === "guest" ? guest.handle(req.params.name, args) : await tool.call(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
