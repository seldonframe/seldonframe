// inspect — the catalog-entry inspect view (spec 1ff09dcb, P1 Task 2).
//
// The Monid-shaped `inspect` step: given a catalog entry, return its input
// schema + pricing + docs so a caller (or an IDE agent) knows HOW to run it
// before paying. Shape mirrors Monid's inspect response:
//   { id, type, name, description, inputSchema, price, docUrl? }
//
// This module is PURE — no DB, no SDK, no network, no "use server". The endpoint
// (app/api/v1/build/inspect) does the I/O: it resolves the listing (for agents)
// or fetches the Composio action's JSON Schema (for tools), then hands the
// resolved pieces here as an InspectSource. The only branch logic is what the
// `inputSchema` should be:
//   • agent → the agent is RUN by sending it a natural-language message, so the
//     schema is the fixed { message, conversationId? } envelope (the rental run
//     input). The agent's own capabilities are echoed for context.
//   • tool  → the action's REAL Composio input schema (passed through verbatim);
//     a permissive object schema when the schema couldn't be fetched.

import type { CatalogPrice } from "@/lib/build/discover";

/** A minimal JSON-Schema object shape (enough for the run inputs we describe). */
export type JsonSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [k: string]: unknown;
};

/** The resolved pieces the endpoint hands `buildInspectView`. For agents the
 *  caller passes capabilities (no inputSchema — we synthesize the run envelope);
 *  for tools the caller passes the fetched inputSchema (+ optional docUrl). */
export type InspectSource = {
  type: "agent" | "tool";
  id: string;
  name: string;
  description: string;
  price: CatalogPrice;
  provider?: string;
  /** agents only: the capability allowlist (echoed for context). */
  capabilities?: string[];
  /** tools only: the action's fetched JSON Schema (undefined ⇒ permissive). */
  inputSchema?: JsonSchema;
  /** optional docs link (tools: the Composio action docs). */
  docUrl?: string;
};

/** The Monid inspect response. `docUrl` / `capabilities` / `provider` are
 *  present only when meaningful for that entry type. */
export type InspectView = {
  id: string;
  type: "agent" | "tool";
  name: string;
  description: string;
  inputSchema: JsonSchema;
  price: CatalogPrice;
  provider?: string;
  capabilities?: string[];
  docUrl?: string;
};

/**
 * The input schema for RUNNING an agent: you send it a natural-language message
 * (the rental run takes a single user turn), with an optional conversationId to
 * thread a multi-turn UI. Fixed + pure — the run envelope every agent shares.
 */
export function agentRunInputSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "What to say to the agent (a single natural-language turn).",
      },
      conversationId: {
        type: "string",
        description: "Optional id to thread turns in your own UI.",
      },
    },
    required: ["message"],
    additionalProperties: false,
  };
}

/** A permissive object schema for a tool whose real schema couldn't be fetched —
 *  the caller may still attempt a run; Composio validates server-side. */
function permissiveSchema(): JsonSchema {
  return { type: "object", properties: {}, additionalProperties: true };
}

/**
 * Shape a resolved entry into the Monid inspect view. Pure: the only logic is
 * choosing the inputSchema (agent run envelope vs the tool's own schema) and
 * including the type-specific fields only when meaningful. Never throws.
 */
export function buildInspectView(source: InspectSource): InspectView {
  const inputSchema =
    source.type === "agent"
      ? agentRunInputSchema()
      : source.inputSchema && typeof source.inputSchema === "object"
        ? source.inputSchema
        : permissiveSchema();

  const view: InspectView = {
    id: source.id,
    type: source.type,
    name: source.name,
    description: source.description,
    inputSchema,
    price: source.price,
  };

  if (source.provider) view.provider = source.provider;
  if (source.type === "agent" && Array.isArray(source.capabilities)) {
    view.capabilities = source.capabilities;
  }
  if (typeof source.docUrl === "string" && source.docUrl.trim().length > 0) {
    view.docUrl = source.docUrl;
  }

  return view;
}
