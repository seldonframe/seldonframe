// ICP-3 (task 1.2) — stateless agent turn runner.
//
// WHY this exists: the production runtime `executeTurn` (runtime.ts) is the
// canonical agent-brain loop, but it is DB-COUPLED — it loads a persisted
// `agentConversations` row + an `agents` row and PERSISTS the user turn, the
// assistant turn, conversation aggregates, and an activity row. The Agent
// Builder needs to TEST a TEMPLATE (table `agent_templates`, no `agents` row, no
// conversation) and the test MUST NOT persist anything or create real bookings.
//
// So this module lifts the SAME LLM↔tools loop out of executeTurn into a pure,
// DB-free, dependency-injected function. It reuses the exact same building
// blocks the production runtime uses — `composeSystemPrompt` (the channel-
// agnostic brain: persona + soul + FAQ + pricing + hard-rules), the
// `getToolsForCapabilities` / `findTool` tool registry, the same `MODEL`, the
// same `MAX_TURN_ITERATIONS` cap, and the same Anthropic Messages-API message
// shape. It does NOT re-implement prompt assembly or tool dispatch; it only
// drops the persistence + budgeting + validator-regen layers that don't apply
// to a throwaway sandbox turn.
//
// Sandboxing: the caller passes `testMode: true`, which flows into every tool's
// `ToolExecuteContext`. Every write tool (book_appointment, escalate_to_human,
// take_message) short-circuits on `ctx.testMode` and returns a synthetic result
// with NO database write (see tools.ts). Read-only tools (look_up_availability)
// still run, so the agent can demonstrate realistic behavior. Nothing here
// imports `@/db` — there is no code path from this module to a mutation.
//
// The Anthropic client is INJECTED (not constructed here) so unit tests exercise
// the loop with a fake client and never hit the network. The server action that
// wraps this resolves the real client via `getAIClient` (the org's BYOK key).

import type Anthropic from "@anthropic-ai/sdk";
import type { OrgSoul } from "@/lib/soul/types";
import type { AgentBlueprint, AgentToolCall } from "@/db/schema/agents";
import { composeSystemPrompt } from "./prompt";
import {
  getToolsForCapabilities,
  type AgentTool,
  type ToolExecuteContext,
} from "./tools";
import { resolveTurnModel } from "./runtime/turn-model";

// Mirror runtime.ts exactly so a template test behaves like the live agent.
const MODEL =
  process.env.ANTHROPIC_AGENT_MODEL?.trim() || "claude-sonnet-4-5-20250929";
const MAX_TURN_ITERATIONS = 6; // tool-call cap per single turn (catches loops)
const MAX_TOKENS = 1024;

/** A chat message in a stateless turn. `tool_use` / `tool_result` blocks are
 *  handled internally per-turn, so the cross-turn history the caller keeps is
 *  just plain user/assistant text — exactly what a chat panel holds. */
export type StatelessChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** A surfaced tool call (name only is enough for the test panel's "checked
 *  availability" note; input kept for richer display / debugging). */
export type StatelessToolCall = {
  name: string;
  input: Record<string, unknown>;
};

/** One tool-dispatch event, fired at call-start and again at its result
 *  (agent lifecycle slice, T5 — the supervised run's live action log DI
 *  seam). `line` is a short, ALREADY-SUMMARIZED human line (tool name plus a
 *  plain-language gloss) — never the raw input/output payload, so a caller
 *  persisting these (e.g. supervised_runs.action_log) can never leak a
 *  secret or a raw tool result. */
export type StatelessToolEvent = {
  tool: string;
  phase: "start" | "result";
  /** Present only on phase:"result" — whether the call succeeded. */
  ok?: boolean;
  line: string;
};

export type RunStatelessAgentTurnInput = {
  /** Workspace identity — passed into ToolExecuteContext so read-only tools
   *  (availability) resolve against the right workspace. */
  orgId: string;
  orgSlug: string;
  /** Business display name for the persona ("You are the receptionist for …"). */
  orgName: string;
  /** Workspace soul (industry, services, voice, hours). May be null. */
  soul: OrgSoul | null;
  /** IANA timezone for temporal grounding + slot labels. */
  timezone: string;
  /** The TEMPLATE's blueprint (greeting / customSkillMd / faq / capabilities /
   *  voice / pricingFacts). The brain is built from this verbatim. */
  blueprint: AgentBlueprint;
  /** Conversation so far (plain text turns). The latest user message is the
   *  last element. */
  messages: StatelessChatMessage[];
  /** Whether to sandbox tool execution. Templates ALWAYS pass true. */
  testMode: boolean;
  /** Injected Anthropic client (resolved from the org's key by the caller; a
   *  fake in tests). */
  client: Anthropic;
  /** Optional wall-clock override for temporal grounding (tests pin it). */
  now?: Date;
  /** Taste mode / cost-pinned callers: force THIS model for every iteration —
   *  bypasses resolveTurnModel entirely (no adaptive/recovery escalation).
   *  Absent => today's behavior. */
  modelOverride?: string;
  /** Replaces the default 1024 output cap when set. */
  maxTokensOverride?: number;
  /** Optional DI hook (agent lifecycle slice, T5) — invoked at each tool
   *  call's start and again at its result, inside the existing dispatch
   *  loop. Default no-op: every existing caller is byte-for-byte
   *  unaffected. Never throws into the loop — a callback error is caught
   *  and swallowed so a logging bug can never break a live agent turn. */
  onToolEvent?: (event: StatelessToolEvent) => void;
};

/** Fires `onToolEvent` if provided, swallowing any error the callback
 *  throws — a logging/observability bug must never break a live agent
 *  turn's tool dispatch loop. */
function emitToolEvent(
  onToolEvent: ((event: StatelessToolEvent) => void) | undefined,
  event: StatelessToolEvent,
): void {
  if (!onToolEvent) return;
  try {
    onToolEvent(event);
  } catch {
    // Never let a callback failure affect the turn loop.
  }
}

export type RunStatelessAgentTurnResult =
  | { ok: true; reply: string; toolCalls: StatelessToolCall[] }
  | { ok: false; reason: string; message: string };

// The Anthropic Messages-API message shape (mirrors runtime.ts).
type AnthropicMessage = {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: unknown }
        | {
            type: "tool_result";
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }
      >;
};

/**
 * Run ONE agent turn statelessly. Builds the system prompt from the blueprint
 * (same composer as production), exposes the blueprint's tool allowlist, and
 * loops LLM↔tools until `end_turn` or the iteration cap — identical to
 * executeTurn's inner loop, minus all persistence. Returns the assistant's
 * final text plus the tool calls it made (for the "checked availability" note).
 *
 * Pure aside from (a) the injected `client.messages.create` network call and
 * (b) read-only tool `execute()` calls (which hit `listPublicBookingSlotsAction`
 * in real use, but never mutate). No DB writes occur from this module.
 */
export async function runStatelessAgentTurn(
  input: RunStatelessAgentTurnInput,
): Promise<RunStatelessAgentTurnResult> {
  const archetype = input.blueprint.archetype ?? "voice-receptionist";

  const systemPrompt = await composeSystemPrompt({
    orgName: input.orgName,
    soul: input.soul as Parameters<typeof composeSystemPrompt>[0]["soul"],
    blueprint: input.blueprint,
    archetype,
    testMode: input.testMode,
    now: input.now ?? new Date(),
    timezone: input.timezone || "UTC",
  });

  // Same seam as production: native (capability-filtered) tools plus any MCP
  // connector tools bound on the template's blueprint. Templates rarely bind
  // connectors, so this is usually the identical native list; when they do, the
  // sandbox exercises them too (the bearer is read from the workspace's
  // encrypted store via the default deps). orgId threads the secret lookup.
  const tools = await getToolsForCapabilities(input.blueprint.capabilities, {
    orgId: input.orgId,
    connectors: input.blueprint.connectors,
  });

  // Seed the messages array from the plain-text chat history.
  const messages: AnthropicMessage[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Adaptive per-turn model (execution-side mirror of the author path): spend the
  // premium model only on HARD turns, stay on the cheap MODEL otherwise. Signals
  // are derived from the in-scope context — the latest user message, the resolved
  // tool allowlist (so a write/booking/escalate tool bumps to premium), and the
  // turn position. `priorToolError` is recomputed inside the loop so a recovery
  // iteration (after a failed tool call) also escalates. Fail-soft: resolveTurnModel
  // never throws — any oddity → MODEL. Honors SF_ADAPTIVE_RUNTIME_MODEL=off.
  const lastUserMessage = [...input.messages].reverse().find((m) => m.role === "user")
    ?.content;
  const toolNamesAvailable = tools.map((t) => t.name);
  let priorToolError = false;

  const allToolCalls: StatelessToolCall[] = [];
  let finalText = "";

  for (let iter = 0; iter < MAX_TURN_ITERATIONS; iter++) {
    const turnModel = input.modelOverride ?? resolveTurnModel({
      userMessage: lastUserMessage,
      toolNamesAvailable,
      priorToolError,
      turnIndex: input.messages.length,
      defaultModel: MODEL,
    });
    let response: Anthropic.Messages.Message;
    try {
      response = await input.client.messages.create({
        model: turnModel,
        max_tokens: input.maxTokensOverride ?? MAX_TOKENS,
        system: systemPrompt,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.jsonSchema as Anthropic.Messages.Tool.InputSchema,
        })),
        messages: messages as Anthropic.Messages.MessageParam[],
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Test sandbox → surface the real diagnostic (operator is debugging
      // their own template, not a customer). Mirrors runtime.ts test-mode.
      return {
        ok: false,
        reason: "llm_error",
        message: `[runtime error] ${detail.slice(0, 300)}`,
      };
    }

    const textBlocks: string[] = [];
    const toolUseBlocks: Array<{ id: string; name: string; input: unknown }> =
      [];
    for (const block of response.content) {
      if (block.type === "text") {
        textBlocks.push(block.text);
      } else if (block.type === "tool_use") {
        toolUseBlocks.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    if (textBlocks.length > 0) {
      finalText = textBlocks.join("\n");
    }

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      break;
    }

    // Append the assistant's tool-call message (mid-turn).
    messages.push({
      role: "assistant",
      content: response.content as AnthropicMessage["content"],
    });

    // Execute each tool through the SAME registry + ToolExecuteContext the
    // production runtime uses — with testMode set, so writes are sandboxed.
    const toolResultsForThisIter: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];
    for (const tu of toolUseBlocks) {
      allToolCalls.push({
        name: tu.name,
        input: (tu.input as Record<string, unknown>) ?? {},
      });
      emitToolEvent(input.onToolEvent, { tool: tu.name, phase: "start", line: `Calling ${tu.name}…` });
      // Resolve across the built tool set (natives + any wrapped MCP tools),
      // matching production's dispatch. Native-only templates resolve exactly as
      // the prior findTool lookup did.
      const tool = tools.find((t) => t.name === tu.name);
      if (!tool) {
        toolResultsForThisIter.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: unknown tool ${tu.name}`,
          is_error: true,
        });
        emitToolEvent(input.onToolEvent, {
          tool: tu.name,
          phase: "result",
          ok: false,
          line: `${tu.name} failed: unknown tool`,
        });
        continue;
      }
      const parsed = tool.inputSchema.safeParse(tu.input);
      if (!parsed.success) {
        toolResultsForThisIter.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: ${parsed.error.message}`,
          is_error: true,
        });
        emitToolEvent(input.onToolEvent, {
          tool: tu.name,
          phase: "result",
          ok: false,
          line: `${tu.name} failed: invalid input`,
        });
        continue;
      }
      const ctx: ToolExecuteContext = {
        orgId: input.orgId,
        orgSlug: input.orgSlug,
        // No real agent row in a template test — use a stable sentinel.
        agentId: "template-test",
        conversationId: "template-test",
        // Sandbox: write tools return synthetic results, no DB writes.
        testMode: input.testMode,
        timezone: input.timezone || undefined,
      };
      try {
        const output = await (tool as AgentTool<unknown, unknown>).execute(
          parsed.data,
          ctx,
        );
        toolResultsForThisIter.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(output ?? null),
        });
        emitToolEvent(input.onToolEvent, { tool: tu.name, phase: "result", ok: true, line: `${tu.name} succeeded.` });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolResultsForThisIter.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: ${message}`,
          is_error: true,
        });
        emitToolEvent(input.onToolEvent, {
          tool: tu.name,
          phase: "result",
          ok: false,
          line: `${tu.name} failed: ${message}`,
        });
      }
    }

    // Did any tool in this iteration error? If so, the NEXT iteration is a
    // recovery turn → escalate it to the premium model via resolveTurnModel.
    priorToolError = toolResultsForThisIter.some((r) => r.is_error === true);

    messages.push({ role: "user", content: toolResultsForThisIter });
  }

  return { ok: true, reply: finalText, toolCalls: allToolCalls };
}

// Re-export the AgentToolCall type for callers that want the canonical shape.
export type { AgentToolCall };
