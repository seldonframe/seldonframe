// Agent-marketplace MCP rental — the PURE JSON-RPC 2.0 / MCP wire layer.
//
// The /api/v1/agents/[slug]/mcp endpoint exposes a listed agent as an
// MCP-over-HTTP server. It speaks the SAME JSON-RPC 2.0 / Streamable-HTTP shape
// that our inline MCP client (lib/agents/mcp/client.ts) CONSUMES — so a
// SeldonFrame agent is reachable by the exact protocol we use to reach other
// MCP servers (initialize → notifications/initialized → tools/list →
// tools/call). Symmetry by design.
//
// Everything here is pure (no db, no env, no I/O) so the route handler stays a
// thin shell: parse → route → run the agent → shape the reply. Unit-tested in
// agent-mcp-rpc.spec.ts.
//
// RENTAL MODEL — "the renter brings the fuel" (BUILD #1):
//   The DEFAULT rental value is the agent's SKILL exposed as an MCP *prompt*
//   (prompts/list + prompts/get → blueprint.customSkillMd, the playbook) plus
//   its DETERMINISTIC, blueprint-carried tools (get_quote_range ← quoteRanges,
//   provide_faq_answer ← faq). The RENTER's OWN LLM loads the prompt and drives
//   those pure lookups — ZERO compute cost to the agent owner/platform.
//
//   The `ask` tool is RETAINED but relabelled as the OPTIONAL "agent-as-a-
//   service (owner's compute)" path: it delegates the whole task to the live
//   agent, which runs the agent loop on the CREATOR's LLM key (see
//   agent-rental-run.ts → runStatelessAgentTurn). That path bills the owner; the
//   prompt + deterministic tools don't.
//
//   We deliberately do NOT expose the workspace-STATEFUL tools (book_appointment,
//   look_up_availability, take_message, CRM writes). Those execute against the
//   CREATOR's workspace (orgId comes from the creator-org runtime), so letting a
//   renter call them would write to the wrong business. They stay INSTALL-ONLY
//   (an installed agent runs in the installer's own workspace). See
//   buildDeterministicToolDescriptors below.

import type { McpToolDescriptor } from "@/lib/agents/mcp/client";
import type { AgentBlueprint } from "@/db/schema/agents";
import { resolveQuoteRange, type QuoteRange } from "@/lib/agents/tools";

/** Advertised MCP protocol version. Matches the client's PROTOCOL_VERSION so a
 *  SeldonFrame-to-SeldonFrame connection negotiates cleanly. Renters on other
 *  clients negotiate down as needed. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** The optional agent-as-a-service delegating tool name (owner's compute). */
export const ASK_TOOL_NAME = "ask";

/** Deterministic, blueprint-carried rental tools (zero-LLM, renter-driven). */
export const GET_QUOTE_RANGE_TOOL_NAME = "get_quote_range";
export const PROVIDE_FAQ_ANSWER_TOOL_NAME = "provide_faq_answer";

// JSON-RPC 2.0 reserved error codes (subset we use).
export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

export type JsonRpcId = number | string | null;

export type JsonRpcRequest = {
  id: JsonRpcId;
  method: string;
  params: Record<string, unknown>;
  /** True when the inbound message carried no `id` (a JSON-RPC notification —
   *  the server MUST NOT reply with a result/error). */
  isNotification: boolean;
};

export type JsonRpcErrorShape = { code: number; message: string; data?: unknown };

export type ParseResult =
  | { ok: true; request: JsonRpcRequest }
  | { ok: false; id: JsonRpcId; error: JsonRpcErrorShape };

/**
 * Parse a raw request body into a JSON-RPC request. Returns a parse-error
 * (-32700) for non-JSON, an invalid-request (-32600) for a malformed envelope
 * (missing/blank method). Notifications (no `id`) are flagged so the caller
 * returns 202 with no body.
 */
export function parseJsonRpcRequest(body: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, id: null, error: { code: JSONRPC_PARSE_ERROR, message: "Parse error: invalid JSON" } };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    // We don't support JSON-RPC batch arrays for this endpoint (MCP doesn't
    // require them for the calls a renter makes).
    return { ok: false, id: null, error: { code: JSONRPC_INVALID_REQUEST, message: "Invalid Request: expected a JSON-RPC object" } };
  }
  const obj = parsed as Record<string, unknown>;
  const hasId = "id" in obj && (typeof obj.id === "number" || typeof obj.id === "string");
  const id: JsonRpcId = hasId ? (obj.id as number | string) : null;

  if (typeof obj.method !== "string" || obj.method.length === 0) {
    return { ok: false, id, error: { code: JSONRPC_INVALID_REQUEST, message: "Invalid Request: missing method" } };
  }
  const params =
    typeof obj.params === "object" && obj.params !== null && !Array.isArray(obj.params)
      ? (obj.params as Record<string, unknown>)
      : {};

  return {
    ok: true,
    request: { id, method: obj.method, params, isNotification: !hasId },
  };
}

// ─── tool descriptor + result shapes ─────────────────────────────────────────

/** Render a human phrase from the agent's capability allowlist for the `ask`
 *  tool description, so the renter (often another LLM) knows what it can
 *  delegate. Falls back to a generic phrase when the agent declares none. */
export function summarizeCapabilities(capabilities: string[] | undefined | null): string {
  const labels: Record<string, string> = {
    look_up_availability: "check availability",
    book_appointment: "book appointments",
    find_my_existing_appointment: "look up existing appointments",
    escalate_to_human: "escalate to a human",
    provide_faq_answer: "answer questions about the business",
    take_message: "take a message",
    get_quote_range: "give ballpark price ranges",
  };
  const phrases = (capabilities ?? [])
    .map((c) => labels[c] ?? c.replace(/_/g, " "))
    .filter(Boolean);
  if (phrases.length === 0) return "handle requests and answer questions on the business's behalf";
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
}

/** Build the OPTIONAL `ask` (agent-as-a-service) tool descriptor for an agent.
 *  Relabelled (BUILD #1): this delegates the task to the LIVE agent, which runs
 *  on the AGENT OWNER's compute (their LLM key + their workspace tools). It's the
 *  optional path — the default rental is the skill prompt + the deterministic
 *  quote/faq tools, which the renter's own LLM drives at zero cost to the owner. */
export function buildAskToolDescriptor(input: {
  agentName: string;
  capabilities: string[] | undefined | null;
}): McpToolDescriptor {
  const summary = summarizeCapabilities(input.capabilities);
  return {
    name: ASK_TOOL_NAME,
    description:
      `Delegate a task to the live ${input.agentName} agent (uses the agent owner's compute). ` +
      `It can ${summary}, running on the owner's LLM + workspace. ` +
      `Returns the agent's reply. Pass conversation_id to continue an existing thread. ` +
      `Prefer the act_as_${"<slug>"} prompt + the get_quote_range / provide_faq_answer tools when you want to drive the agent with your OWN model (no owner compute).`,
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: `The task or message for the ${input.agentName} agent.`,
        },
        conversation_id: {
          type: "string",
          description: "Optional. Echo back a prior reply's conversation_id to keep context.",
        },
      },
      required: ["message"],
    },
    // `ask` runs the LIVE agent loop on the owner's compute + workspace, which
    // WRITES conversation rows under the seller org (see runStatelessAgentTurn)
    // — not read-only. It stays non-destructive because the workspace-stateful
    // tools it could reach (book_appointment, CRM writes, etc.) are additive/
    // scheduling actions, not deletions, and it hits the owner's own LLM +
    // workspace rather than an arbitrary external system, so it's closed-world.
    annotations: {
      title: "Ask the Agent",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  };
}

/** The `initialize` result: protocol + server identity + capabilities. Now
 *  advertises BOTH tools (ask + deterministic) and prompts (the skill prompt).
 *  `instructions` is additive (taste mode only) — the key is present ONLY when
 *  the param is passed, so the flag-off envelope is byte-identical to before. */
export function buildInitializeResult(input: { agentName: string; instructions?: string }): Record<string, unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {}, prompts: {} },
    serverInfo: {
      name: input.agentName,
      version: "1.0.0",
    },
    ...(input.instructions ? { instructions: input.instructions } : {}),
  };
}

/** The `tools/list` result: the deterministic, renter-driven tools
 *  (get_quote_range + provide_faq_answer — zero owner compute) PLUS the optional
 *  `ask` agent-as-a-service tool. Workspace-stateful tools are intentionally
 *  excluded (they'd write to the creator's workspace). */
export function buildToolsListResult(input: {
  agentName: string;
  capabilities: string[] | undefined | null;
}): Record<string, unknown> {
  return {
    tools: [
      ...buildDeterministicToolDescriptors({ agentName: input.agentName }),
      buildAskToolDescriptor(input),
    ],
  };
}

// ─── taste mode (net-new, anonymous free lane) ───────────────────────────────
//
// The grounding tool + a taste-flavored tools/list. See
// docs/superpowers/specs/2026-07-03-agent-taste-mode-design.md D2. These are
// only ever invoked by the handler's taste lane (bearer === null AND the
// listing's taste policy is active) — the paid tools/list above is completely
// untouched.

/** Taste mode — the grounding tool's wire name. */
export const GROUND_TOOL_NAME = "ground_on_my_business";

/** Taste mode — the grounding tool descriptor. */
export function buildGroundToolDescriptor(): McpToolDescriptor {
  return {
    name: GROUND_TOOL_NAME,
    description:
      `FREE TASTE: ground this agent on YOUR business. Pass your website URL; ` +
      `the agent reads it and demos as if it were deployed for you. Returns a ` +
      `taste_session value — pass it to later ask calls to stay grounded.`,
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Your business website (https://…)." },
      },
      required: ["url"],
    },
    // Fetches the visitor's OWN provided website URL to ground a demo — reads
    // an external page (open-world) and stores a session marker, but performs
    // no destructive action and isn't safely repeatable-with-no-effect (a
    // fresh grounding read each time), so it's not idempotent.
    annotations: {
      title: "Ground on My Business",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  };
}

/** Taste mode tools/list: the read-only subset + ground. The ask descriptor
 *  gains an optional taste_session arg in this variant. */
export function buildTasteToolsListResult(input: {
  agentName: string;
  capabilities: string[] | undefined | null;
  visitorLimit: number;
}): Record<string, unknown> {
  const ask = buildAskToolDescriptor(input);
  const askSchema = ask.inputSchema as { properties: Record<string, unknown> };
  askSchema.properties.taste_session = {
    type: "string",
    description: "Optional. The taste_session from ground_on_my_business — keeps the demo grounded on your business.",
  };
  ask.description =
    `${ask.description} FREE TASTE MODE: you have ${input.visitorLimit} free calls; ` +
    `run ${GROUND_TOOL_NAME} first for a demo grounded on your own business.`;
  return {
    tools: [
      ...buildDeterministicToolDescriptors({ agentName: input.agentName }),
      ask,
      buildGroundToolDescriptor(),
    ],
  };
}

// ─── tools/call argument extraction ──────────────────────────────────────────

export type AskArgs =
  | { ok: true; message: string; conversationId: string | undefined }
  | { ok: false; error: JsonRpcErrorShape };

/**
 * Validate + extract the `ask` call's arguments from a tools/call params block
 * ({ name, arguments }). A wrong tool name is method-not-found (-32601 — the
 * only callable tool is `ask`); a missing/blank/non-string message is
 * invalid-params (-32602). A non-string conversation_id is treated as absent
 * (lenient — a bad optional field shouldn't fail the call).
 */
export function extractAskArgs(params: Record<string, unknown>): AskArgs {
  const name = typeof params.name === "string" ? params.name : "";
  if (name !== ASK_TOOL_NAME) {
    return { ok: false, error: { code: JSONRPC_METHOD_NOT_FOUND, message: `Unknown tool: ${name || "(none)"}. The only tool is "${ASK_TOOL_NAME}".` } };
  }
  const args =
    typeof params.arguments === "object" && params.arguments !== null
      ? (params.arguments as Record<string, unknown>)
      : {};
  const rawMessage = args.message;
  if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
    return { ok: false, error: { code: JSONRPC_INVALID_PARAMS, message: "Invalid params: `message` (non-empty string) is required." } };
  }
  const conversationId =
    typeof args.conversation_id === "string" && args.conversation_id.length > 0
      ? args.conversation_id
      : undefined;
  return { ok: true, message: rawMessage.trim(), conversationId };
}

// ─── prompts (the agent's skill, BUILD #1) ───────────────────────────────────
//
// MCP prompts/list + prompts/get are NET-NEW on this router. We expose ONE
// prompt — `act_as_<slug>` — whose body is the agent's blueprint.customSkillMd
// (its playbook) plus a one-line framing. The renter's own LLM loads this and
// then drives the deterministic tools below — zero owner compute.

/** Stable prompt name for an agent's skill. One prompt per rented agent. */
export function promptNameForSlug(slug: string): string {
  return `act_as_${slug}`;
}

/** The `prompts/list` result: the single act-as skill prompt (no arguments). */
export function buildPromptsListResult(input: {
  slug: string;
  agentName: string;
  capabilities: string[] | undefined | null;
}): Record<string, unknown> {
  const summary = summarizeCapabilities(input.capabilities);
  return {
    prompts: [
      {
        name: promptNameForSlug(input.slug),
        description: `Act as the ${input.agentName} agent — it can ${summary}. Loads the agent's skill (its playbook) so your own model can run it.`,
        arguments: [],
      },
    ],
  };
}

/** Validated `prompts/get` params. */
export type PromptsGetParams =
  | { ok: true; name: string }
  | { ok: false; error: JsonRpcErrorShape };

/** Extract + validate the `prompts/get` `name`. Blank/missing/non-string →
 *  invalid-params (-32602). */
export function parsePromptsGetParams(params: Record<string, unknown>): PromptsGetParams {
  const raw = params.name;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: { code: JSONRPC_INVALID_PARAMS, message: "Invalid params: `name` (non-empty string) is required." } };
  }
  return { ok: true, name: raw.trim() };
}

/** The names of the deterministic, blueprint-carried tools a renter can drive. */
function deterministicToolNames(): string[] {
  return [GET_QUOTE_RANGE_TOOL_NAME, PROVIDE_FAQ_ANSWER_TOOL_NAME];
}

export type PromptGetOutcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: JsonRpcErrorShape };

/**
 * Build the `prompts/get` result for an agent: a single message whose text is
 * the agent's playbook (blueprint.customSkillMd) framed by a one-liner that
 * names the agent and lists the deterministic tools the renter's model can call.
 * When the blueprint has no customSkillMd, we still return a usable instruction
 * (name + capabilities) so the prompt is never empty.
 *
 * Pure: the caller is responsible for having resolved the agent + verified the
 * requested prompt name matches (see handler). We accept the agent here and
 * always succeed — an unknown NAME is rejected in the handler, not here.
 */
export function buildPromptGetResult(input: {
  slug: string;
  agentName: string;
  blueprint: AgentBlueprint;
}): PromptGetOutcome {
  const toolNames = deterministicToolNames().join(", ");
  const skill = (input.blueprint.customSkillMd ?? "").trim();
  const framing =
    `You are ${input.agentName}. Follow this skill exactly. ` +
    `Tools available: ${toolNames}.`;
  const body = skill ? `${framing}\n\n${skill}` : framing;
  return {
    ok: true,
    result: {
      description: `The ${input.agentName} agent's skill — load it, then drive the ${toolNames} tools with your own model.`,
      messages: [
        {
          role: "user",
          content: { type: "text", text: body },
        },
      ],
    },
  };
}

// ─── deterministic rental tools (zero-LLM, renter-driven) ────────────────────
//
// These are the BLUEPRINT-CARRIED, deterministic capabilities — pure server-side
// lookups, NO LLM call, NO workspace writes. They're safe to rent because they
// read ONLY the listing's own blueprint (quoteRanges / faq), carried inline at
// publish time. The renter's model calls them after loading the skill prompt.
//
// EXCLUDED ON PURPOSE — workspace-stateful tools (book_appointment,
// look_up_availability, take_message, and any CRM write) are NOT exposed here.
// They resolve orgId from the CREATOR-org runtime and would write to the
// creator's business, so renting them would corrupt the wrong workspace. They
// remain INSTALL-ONLY: installing the agent runs those tools in the installer's
// own workspace, which is correct. See tools.ts ALL_TOOLS for the full set.

/** Build the deterministic tool descriptors (get_quote_range + provide_faq_answer)
 *  with real MCP inputSchemas. Independent of capabilities: the data lives on the
 *  blueprint and a missing range/faq simply yields an empty/`hasRange:false`
 *  result, so advertising them is always safe. */
export function buildDeterministicToolDescriptors(input: { agentName: string }): McpToolDescriptor[] {
  return [
    {
      name: GET_QUOTE_RANGE_TOOL_NAME,
      description:
        `Get the price RANGE the ${input.agentName} business quotes for a service. ` +
        `Returns { hasRange:true, low, high, note } for a configured service, or { hasRange:false } when it isn't priced ` +
        `(then tell the customer a person will confirm). Never invent a price. Deterministic lookup — no AI, no cost.`,
      inputSchema: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description: "The service the customer is asking the price of (e.g. 'furnace repair').",
          },
        },
        required: ["service"],
      },
      // Pure lookup over the listing's own blueprint.quoteRanges — no LLM, no
      // I/O, no workspace write. Same inputs always yield the same output.
      annotations: {
        title: "Get Quote Range",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: PROVIDE_FAQ_ANSWER_TOOL_NAME,
      description:
        `Answer a customer question from the ${input.agentName} business's FAQ knowledge. ` +
        `Returns up to 3 best-matching { question, answer, score } pairs, or an empty list when nothing matches ` +
        `(then don't guess). Deterministic keyword lookup — no AI, no cost.`,
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The customer's question, in their own words.",
          },
        },
        required: ["question"],
      },
      // Pure keyword match over the listing's own blueprint.faq — no LLM, no
      // I/O, no workspace write. Same inputs always yield the same output.
      annotations: {
        title: "Provide FAQ Answer",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];
}

/** True when a tools/call name targets a deterministic (zero-LLM) tool. */
export function isDeterministicTool(name: string): boolean {
  return deterministicToolNames().includes(name);
}

export type DeterministicToolOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: JsonRpcErrorShape };

/** Normalize a string for keyword matching (lowercase, strip punctuation). */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const FAQ_STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "do", "does", "is", "are", "you", "your", "i",
  "we", "what", "how", "can", "and", "or", "for", "in", "on", "with", "my",
]);

/**
 * Pure FAQ matcher over blueprint.faq. Scores each Q&A by overlap of meaningful
 * tokens between the question and the stored q (+ a smaller weight for the
 * answer), returns up to 3 matches with score > 0, sorted desc. No match → [].
 * Deterministic, no LLM — so a renter's model gets grounded answers for free
 * and an empty set (rather than a hallucination) when nothing fits.
 */
export function matchFaq(
  question: string,
  faq: AgentBlueprint["faq"],
): Array<{ question: string; answer: string; score: number }> {
  const entries = faq ?? [];
  const qTokens = normalizeForMatch(question)
    .split(" ")
    .filter((t) => t.length > 1 && !FAQ_STOPWORDS.has(t));
  if (qTokens.length === 0 || entries.length === 0) return [];
  const qSet = new Set(qTokens);

  const scored = entries.map((entry) => {
    const entryTokens = new Set(
      normalizeForMatch(entry.q).split(" ").filter((t) => t.length > 1 && !FAQ_STOPWORDS.has(t)),
    );
    const answerTokens = new Set(
      normalizeForMatch(entry.a).split(" ").filter((t) => t.length > 1 && !FAQ_STOPWORDS.has(t)),
    );
    let score = 0;
    for (const t of qSet) {
      if (entryTokens.has(t)) score += 2; // a question-word match is strong
      else if (answerTokens.has(t)) score += 1; // an answer-word match is weaker
    }
    return { question: entry.q, answer: entry.a, score };
  });

  return scored
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Execute a deterministic rental tool PURELY against the listing's blueprint —
 * NO LLM, NO workspace I/O. Returns the MCP tool's structured result, or a
 * JSON-RPC error (-32601 unknown tool, -32602 bad args). The handler shapes the
 * `ok:true` result into MCP content; usage is NOT logged for these (no owner
 * compute was spent — nothing to bill).
 */
export function executeDeterministicTool(
  name: string,
  args: Record<string, unknown>,
  blueprint: AgentBlueprint,
): DeterministicToolOutcome {
  if (name === GET_QUOTE_RANGE_TOOL_NAME) {
    const service = typeof args.service === "string" ? args.service.trim() : "";
    if (!service) {
      return { ok: false, error: { code: JSONRPC_INVALID_PARAMS, message: "Invalid params: `service` (non-empty string) is required." } };
    }
    const ranges: QuoteRange[] = blueprint.quoteRanges ?? [];
    const match = resolveQuoteRange(service, ranges);
    if (!match) {
      return { ok: true, result: { hasRange: false } };
    }
    return {
      ok: true,
      result: {
        hasRange: true,
        service: match.service,
        low: match.low,
        high: match.high,
        note: match.note?.trim() || "a technician confirms the exact price on-site",
      },
    };
  }

  if (name === PROVIDE_FAQ_ANSWER_TOOL_NAME) {
    const question = typeof args.question === "string" ? args.question.trim() : "";
    if (!question) {
      return { ok: false, error: { code: JSONRPC_INVALID_PARAMS, message: "Invalid params: `question` (non-empty string) is required." } };
    }
    return { ok: true, result: { matches: matchFaq(question, blueprint.faq) } };
  }

  return { ok: false, error: { code: JSONRPC_METHOD_NOT_FOUND, message: `Unknown tool: ${name || "(none)"}.` } };
}

// ─── envelope builders ───────────────────────────────────────────────────────

/** A JSON-RPC 2.0 success envelope. */
export function jsonRpcResult(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

/** A JSON-RPC 2.0 error envelope. */
export function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/** Shape an agent reply text as an MCP `tools/call` result (content array). */
export function toolTextResult(text: string, isError = false): Record<string, unknown> {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}
