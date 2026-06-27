// v1.26.0 — agent runtime: executeTurn(conversationId, userMessage)
//
// Non-streaming for v1.26.0 (returns full response after all tool
// calls resolve). v1.26.1 adds SSE streaming.
//
// Flow per turn:
//   1. Load conversation + agent + soul (+ brain in v1.26.1)
//   2. Check daily token budget — gracefully degrade if exhausted
//   3. Persist user turn
//   4. Build messages array from conversation history
//   5. Call Anthropic with system prompt + tools allowlist
//   6. Loop: handle tool_use blocks (validate input, execute, append result)
//   7. Run validators on final assistant text
//      - critical fail → fallback to "let me check" + escalate
//   8. Persist assistant turn (with validators_passed, tokens, latency)
//   9. Update conversation aggregate counters
//   10. Activity-bridge: if first turn, write activity row to operator's CRM
//   11. Return assistant response

"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import {
  agentConversations,
  agentTurns,
  agents,
  organizations,
  activities,
  users,
  type Agent,
  type AgentBlueprint,
  type AgentToolCall,
  type AgentToolResult,
  type AgentValidatorResult,
} from "@/db/schema";
import { getAIClient } from "@/lib/ai/client";
import { composeSystemPrompt, applyDeploymentPersona } from "./prompt";
import type { DeploymentPromptPersona } from "./prompt";
import { runValidators } from "./validators";
import { composeCorrectionPrompt, selectFinalFallback } from "./fallbacks";
import {
  getToolsForCapabilities,
  type AgentTool,
  type ToolExecuteContext,
} from "./tools";
import { resolveTurnModel } from "./runtime/turn-model";
import type { CalendarBinding } from "@/lib/agents/booking/calendar-backend";
import type { BookingPolicy } from "@/lib/agents/booking/booking-policy";
import { bindingToCtxBooking } from "@/lib/agents/booking/binding-ctx";

const MODEL = process.env.ANTHROPIC_AGENT_MODEL?.trim() || "claude-sonnet-4-5-20250929";
const MAX_TURN_ITERATIONS = 6; // tool-call cap per single turn (catches loops)
// v1.26.1 — these are SF's internal accounting markup for
// billing-the-operator-for-agent-platform-usage. The OPERATOR pays
// the LLM bill directly via their BYOK Anthropic key; SF makes money
// per agent turn (separate billing line). Numbers are deliberately
// rough — the operator's exact LLM cost lives on their Anthropic
// dashboard; ours is platform-usage metering.
const COST_PER_1K_INPUT_CENTS = 0.3;
const COST_PER_1K_OUTPUT_CENTS = 1.5;

type ExecuteTurnResult =
  | {
      ok: true;
      assistantMessage: string;
      validators: AgentValidatorResult[];
      toolCalls: AgentToolCall[];
      toolResults: AgentToolResult[];
      tokensIn: number;
      tokensOut: number;
      latencyMs: number;
    }
  | { ok: false; reason: string; fallbackMessage: string };

// bindingToCtxBooking (the pure CalendarBinding → ctx.booking mapper) lives in
// ./booking/binding-ctx — runtime.ts is "use server", and Turbopack's `next
// build` rejects any non-async export from a "use server" module.

export async function executeTurn(input: {
  conversationId: string;
  userMessage: string;
  /** Optional blueprint override — used by the eval runner to inject test
   *  fixtures (e.g. poisoned FAQ entries) without mutating the DB. The
   *  override replaces agent.blueprint for this turn only. */
  blueprintOverride?: AgentBlueprint;
  /** DEPLOYED-agent only (ICP-3). The deployment's runtime calendar binding,
   *  derived by run-channel-turn via deploymentToBinding. Threaded onto
   *  `ctx.booking` so the chat/SMS/email booking tools branch identically to
   *  voice. Absent for workspace/operator agents → ctx.booking stays undefined
   *  (native default, unchanged behavior). */
  bookingBinding?: CalendarBinding;
  /** Per-client booking policy (P1) — the RESOLVED policy run-channel-turn
   *  derives alongside the binding. Threaded onto ctx.booking.policy so the
   *  booking tools shape slots + the required-fields gate from the client's
   *  rules. Absent → the tools fall back to system defaults. */
  bookingPolicy?: BookingPolicy;
  /** DEPLOYED-agent only (P2). The RESOLVED per-deployment persona
   *  run-channel-turn derives (greeting / prompt / faq / services), already
   *  placeholder-filled. Applied to the prompt-builder inputs via
   *  applyDeploymentPersona so the deployed client agent speaks AS the client:
   *  prompt → customSkillMd, faq → blueprint.faq, services → soul.services,
   *  greeting → opener directive. Absent for workspace/operator agents → the
   *  prompt is composed from the agent's own blueprint/soul, byte-for-byte
   *  unchanged. */
  persona?: DeploymentPromptPersona;
}): Promise<ExecuteTurnResult> {
  const t0 = Date.now();

  // 1. Load conversation + agent + org + soul
  const [conv] = await db
    .select()
    .from(agentConversations)
    .where(eq(agentConversations.id, input.conversationId))
    .limit(1);
  if (!conv) {
    return {
      ok: false,
      reason: "conversation_not_found",
      fallbackMessage: "I'm sorry, this chat session has expired. Please refresh the page.",
    };
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, conv.agentId))
    .limit(1);
  if (!agent) {
    return {
      ok: false,
      reason: "agent_not_found",
      fallbackMessage: "I'm sorry, this assistant is unavailable. Please contact us directly.",
    };
  }

  const [orgRow] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      soul: organizations.soul,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(eq(organizations.id, agent.orgId))
    .limit(1);
  if (!orgRow) {
    return {
      ok: false,
      reason: "org_not_found",
      fallbackMessage: "I'm sorry, something went wrong. Please contact us directly.",
    };
  }

  // v1.27.9 — daily token budget removed. Under BYOK the operator pays
  // Anthropic directly; SF has no cost exposure to cap. Operators manage
  // spend in their own Anthropic billing dashboard. The artificial budget
  // halt was breaking valid conversations on busy days for no reason.
  // The agents.tokensUsedToday + dailyTokenBudget columns stay in the
  // schema (no breaking migration); they're just no longer checked or
  // incremented by the runtime.

  // 3. Persist user turn
  const [lastTurn] = await db
    .select({ turnIndex: agentTurns.turnIndex })
    .from(agentTurns)
    .where(eq(agentTurns.conversationId, input.conversationId))
    .orderBy(sql`${agentTurns.turnIndex} DESC`)
    .limit(1);
  const nextTurnIndex = (lastTurn?.turnIndex ?? -1) + 1;

  await db.insert(agentTurns).values({
    conversationId: input.conversationId,
    turnIndex: nextTurnIndex,
    role: "user",
    content: input.userMessage,
  });

  // 4. Build messages array from conversation history
  const history = await db
    .select({
      role: agentTurns.role,
      content: agentTurns.content,
      toolCalls: agentTurns.toolCalls,
      toolResults: agentTurns.toolResults,
    })
    .from(agentTurns)
    .where(eq(agentTurns.conversationId, input.conversationId))
    .orderBy(asc(agentTurns.turnIndex));

  // Convert SF turn shape → Anthropic Messages API shape.
  type AnthropicMessage = {
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; id: string; name: string; input: unknown }
          | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
        >;
  };
  const messages: AnthropicMessage[] = [];
  for (const turn of history) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content ?? "" });
    } else if (turn.role === "assistant") {
      const blocks: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: unknown }
      > = [];
      if (turn.content) blocks.push({ type: "text", text: turn.content });
      if (turn.toolCalls) {
        for (const tc of turn.toolCalls) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        }
      }
      messages.push({ role: "assistant", content: blocks });
      // Tool results from previous turns ride as a user message.
      if (turn.toolResults && turn.toolResults.length > 0) {
        messages.push({
          role: "user",
          content: turn.toolResults.map((tr) => ({
            type: "tool_result" as const,
            tool_use_id: tr.toolCallId,
            content: tr.ok
              ? JSON.stringify(tr.output ?? null)
              : `Error: ${tr.error ?? "unknown"}`,
            is_error: !tr.ok,
          })),
        });
      }
    }
  }

  // 5. System prompt + tools
  // blueprintOverride is set by the eval runner for fixture-injection scenarios
  // (e.g. poisoned FAQ entries). Never present in production paths.
  const baseBlueprint = (input.blueprintOverride ?? agent.blueprint ?? {}) as AgentBlueprint;
  const baseSoul =
    (orgRow.soul as Parameters<typeof composeSystemPrompt>[0]["soul"]) ?? null;
  // Per-deployment persona (P2) — splice the RESOLVED client persona into the
  // prompt-builder inputs, mirroring the voice path: prompt → customSkillMd,
  // faq → blueprint.faq, services → soul.services, greeting → opener directive.
  // Absent (workspace/operator agents) → byte-for-byte the same inputs as before
  // (applyDeploymentPersona returns blueprint/soul unchanged + greetingPrefix null).
  const {
    blueprint,
    soul: personaSoul,
    greetingPrefix,
  } = applyDeploymentPersona({
    blueprint: baseBlueprint,
    soul: baseSoul,
    persona: input.persona ?? null,
  });
  const systemPrompt = await composeSystemPrompt({
    orgName: orgRow.name,
    soul: personaSoul,
    blueprint,
    archetype: agent.archetype,
    testMode: conv.status === "test",
    // v1.27.7 — temporal grounding so the agent can resolve "this Friday"
    // / "tomorrow" / "next week" without asking. Workspace timezone
    // anchors the resolution to the operator's local time.
    now: new Date(),
    timezone: orgRow.timezone ?? "UTC",
    // Per-deployment opener (P2) — null on the workspace path → no opener section.
    greetingPrefix,
  });
  // The seam: native (capability-filtered) tools PLUS any bound MCP connector
  // tools (blueprint.connectors), wrapped to look native. With no connectors
  // this returns the identical native list it always did — the dispatch loop
  // below is unchanged. orgId threads each wrapped tool's encrypted-key lookup.
  const tools = await getToolsForCapabilities(blueprint.capabilities, {
    orgId: agent.orgId,
    connectors: blueprint.connectors,
  });

  // v1.26.1 — BYOK. Resolve the LLM client from the workspace's
  // configured key (organizations.integrations.anthropic.apiKey,
  // encrypted at rest). Operator pays Anthropic directly; SF charges
  // separately per agent turn. If no BYOK key is set AND no platform
  // key is available (e.g. SF env not configured), gracefully degrade.
  const aiResolution = await getAIClient({ orgId: agent.orgId });
  if (!aiResolution.client) {
    return {
      ok: false,
      reason: "llm_not_configured",
      fallbackMessage:
        "I'm not set up to chat yet — the team is finishing my configuration. Please reach out directly and we'll be in touch right away.",
    };
  }
  const anthropic: Anthropic = aiResolution.client;

  // 6. Loop over LLM ↔ tools until we get a stop_reason of "end_turn"
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const allToolCalls: AgentToolCall[] = [];
  const allToolResults: AgentToolResult[] = [];
  let finalText = "";

  // Adaptive per-turn model selection — the execution-side mirror of the author
  // path. Spend the premium model ONLY on HARD turns (booking/quote/escalation
  // intent in the user message, a write/booking/escalate tool available, a turn
  // recovering from a tool error, or a long/complex message); stay on the cheap
  // MODEL for easy turns ("what are your hours?"). Signals come from the in-scope
  // context. `priorToolError` is recomputed inside the loop so a recovery
  // iteration escalates. FAIL-SOFT: resolveTurnModel never throws — any oddity →
  // MODEL — so a turn can never break (or silently get pricier) on selection.
  // Honors the SF_ADAPTIVE_RUNTIME_MODEL=off kill switch.
  const toolNamesAvailable = tools.map((t) => t.name);
  let priorToolError = false;
  // The model actually used for the LAST call this turn — persisted on the
  // assistant turn row so cost/observability reflect what was spent, not MODEL.
  let lastModelUsed = MODEL;

  for (let iter = 0; iter < MAX_TURN_ITERATIONS; iter++) {
    const turnModel = resolveTurnModel({
      userMessage: input.userMessage,
      toolNamesAvailable,
      priorToolError,
      turnIndex: nextTurnIndex,
      defaultModel: MODEL,
    });
    lastModelUsed = turnModel;
    let response: Anthropic.Messages.Message;
    try {
      response = await anthropic.messages.create({
        model: turnModel,
        max_tokens: 1024,
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
      const errClass = classifyAnthropicError(detail);
      console.error(
        `[agent-runtime] anthropic_error agentId=${agent.id} convId=${conv.id} class=${errClass.reason} err=${detail}`,
      );
      return {
        ok: false,
        reason: errClass.reason,
        // Test-mode = SF client testing in sandbox → return real diagnostic.
        // Live/active = end customer talking to agent → return gentle fallback.
        fallbackMessage:
          conv.status === "test"
            ? `[runtime error: ${errClass.reason}] ${errClass.operatorHint}`
            : "I'm having a hiccup. Can I have someone follow up with you? What's your email?",
      };
    }

    totalTokensIn += response.usage?.input_tokens ?? 0;
    totalTokensOut += response.usage?.output_tokens ?? 0;

    // Extract text + tool_use blocks
    const textBlocks: string[] = [];
    const toolUseBlocks: Array<{ id: string; name: string; input: unknown }> = [];
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

    // Append assistant message to messages history (mid-turn)
    messages.push({
      role: "assistant",
      content: response.content as AnthropicMessage["content"],
    });

    // Execute tools
    const toolResultsForThisIter: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];
    for (const tu of toolUseBlocks) {
      allToolCalls.push({ id: tu.id, name: tu.name, input: tu.input as Record<string, unknown> });
      // Resolve by name across the tool set we built above — which now includes
      // wrapped MCP connector tools alongside the natives. (Native-only behavior
      // is unchanged: with no connectors this is exactly `tools` = the native
      // list, so resolution is identical to the prior findTool(NATIVE) lookup.)
      const tool = tools.find((t) => t.name === tu.name);
      if (!tool) {
        const result: AgentToolResult = {
          toolCallId: tu.id,
          ok: false,
          error: `Unknown tool: ${tu.name}`,
        };
        allToolResults.push(result);
        toolResultsForThisIter.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: unknown tool ${tu.name}`,
          is_error: true,
        });
        continue;
      }
      // Validate input against schema
      const parsed = tool.inputSchema.safeParse(tu.input);
      if (!parsed.success) {
        const result: AgentToolResult = {
          toolCallId: tu.id,
          ok: false,
          error: `Input validation failed: ${parsed.error.message}`,
        };
        allToolResults.push(result);
        toolResultsForThisIter.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: ${parsed.error.message}`,
          is_error: true,
        });
        continue;
      }
      // Execute
      const ctx: ToolExecuteContext = {
        orgId: agent.orgId,
        orgSlug: orgRow.slug,
        agentId: agent.id,
        conversationId: conv.id,
        testMode: conv.status === "test",
        // ICP-3 — deployed-agent calendar binding (chat/SMS/email parity with
        // voice). Undefined for workspace agents → ctx.booking stays undefined.
        // Per-client booking policy threaded alongside (P1).
        booking: bindingToCtxBooking(input.bookingBinding, input.bookingPolicy),
      };
      try {
        const output = await (tool as AgentTool<unknown, unknown>).execute(parsed.data, ctx);
        const result: AgentToolResult = { toolCallId: tu.id, ok: true, output };
        allToolResults.push(result);
        toolResultsForThisIter.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(output ?? null),
        });
      } catch (err) {
        const result: AgentToolResult = {
          toolCallId: tu.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        allToolResults.push(result);
        toolResultsForThisIter.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        });
      }
    }

    // Did any tool in this iteration error? If so, the NEXT iteration is a
    // recovery turn → escalate it to the premium model via resolveTurnModel.
    priorToolError = toolResultsForThisIter.some((r) => r.is_error === true);

    messages.push({
      role: "user",
      content: toolResultsForThisIter,
    });
  }

  // 7. Run validators
  // v1.27.7 — pass full conversation context (all user turns + tool
  // results) so no_pii_leak doesn't flag echoes of data the customer
  // already provided OR that a tool returned (e.g. find_my_existing_
  // appointment surfacing the linked contact's phone).
  const conversationContext = history
    .map((turn) => {
      const parts: string[] = [];
      if (turn.role === "user" && turn.content) parts.push(turn.content);
      if (turn.toolResults) {
        for (const tr of turn.toolResults) {
          if (tr.ok) parts.push(JSON.stringify(tr.output ?? null));
        }
      }
      return parts.join("\n");
    })
    .filter(Boolean)
    .join("\n");

  // v1.28.6 — pass soul.contact so no_pii_leak doesn't over-fire on the
  // operator's own business email/phone (sharing those is the agent's
  // job, not a privacy violation).
  const soulForValidators = (orgRow.soul as {
    services?: Array<{ name: string }>;
    voice?: { avoidWords?: string[] };
    contact?: { email?: string; phone?: string };
  } | null) ?? null;

  // v1.40.12 — also build a set of tool names that succeeded in
  // PREVIOUS turns of this conversation. Pattern that broke pre-1.40.12:
  // Turn N agent successfully calls book_appointment + presents details.
  // Turn N+1 user says "go ahead." Turn N+1 agent says "You're booked
  // for Monday at 1pm." Validator scoped to THIS turn only saw no
  // book_appointment call → flagged as hallucination → regen → flagged
  // again → fallback. The booking was real; the validator was wrong.
  // Fix: union this turn's successful tools with recent history.
  const recentSuccessfulTools: string[] = [];
  for (const turn of history) {
    if (turn.role !== "assistant") continue;
    const turnCalls = turn.toolCalls ?? [];
    const turnResults = turn.toolResults ?? [];
    for (const call of turnCalls) {
      const result = turnResults.find((r) => r.toolCallId === call.id);
      if (result?.ok) recentSuccessfulTools.push(call.name);
    }
  }

  let validatorResults: AgentValidatorResult[];
  let criticalFailed: boolean;
  ({ results: validatorResults, criticalFailed } = runValidators({
    response: finalText,
    userMessage: input.userMessage,
    conversationContext,
    // v1.27.10 — pass this turn's tool calls + results so the
    // no_hallucinated_state_change validator can verify completion
    // claims are backed by successful tool calls.
    turnToolCalls: allToolCalls,
    turnToolResults: allToolResults,
    // v1.40.12 — pass previous turns' successful tool names so the
    // hallucination validator allows legitimate follow-up confirmations.
    recentSuccessfulTools,
    blueprint,
    soul: soulForValidators,
  }));

  // v1.28.6 — REGENERATE on critical fail (Karpathy: trust the LLM with
  // corrective context, don't replace its judgment with a hardcoded
  // template). On critical fail, append a synthetic user message
  // describing the violation(s) and ask the LLM to write a clean
  // response. Re-run validators. If they still fail, use the
  // per-validator final fallback (better than the v1.27.x one-size-
  // fits-all "what's your email?"). Limited to ONE retry to bound
  // token cost on adversarial probes.
  if (criticalFailed) {
    const failedNames = validatorResults
      .filter((v) => !v.passed)
      .map((v) => v.name);
    console.warn(
      `[agent-runtime] critical_validator_failed_will_regenerate agentId=${agent.id} convId=${conv.id} fails=${failedNames.join(",")}`,
    );

    try {
      const correctionPrompt = composeCorrectionPrompt(failedNames);
      // Append a synthetic user message; reuse the same system + tools
      // + conversation history. The LLM has one chance to recover.
      const regenMessages: AnthropicMessage[] = [
        ...messages,
        { role: "user", content: correctionPrompt },
      ];
      // Regeneration IS a hard turn — the model just produced a critically-
      // failing response and gets one chance to recover. Escalate to premium
      // (priorToolError-equivalent recovery signal). Fail-soft → MODEL.
      const regenModel = resolveTurnModel({
        userMessage: input.userMessage,
        toolNamesAvailable,
        priorToolError: true,
        turnIndex: nextTurnIndex,
        defaultModel: MODEL,
      });
      lastModelUsed = regenModel;
      const regenResponse = await anthropic.messages.create({
        model: regenModel,
        max_tokens: 512,
        system: systemPrompt,
        // No tools on regeneration — we want a clean text response, not
        // another tool-loop iteration. The original turn already
        // resolved any tool calls; we're fixing the FINAL TEXT.
        messages: regenMessages as Anthropic.Messages.MessageParam[],
      });
      totalTokensIn += regenResponse.usage?.input_tokens ?? 0;
      totalTokensOut += regenResponse.usage?.output_tokens ?? 0;
      const regenText = regenResponse.content
        .filter(
          (b): b is Anthropic.Messages.TextBlock => b.type === "text",
        )
        .map((b) => b.text)
        .join("\n");

      if (regenText) {
        // Re-run validators on the regenerated response.
        const second = runValidators({
          response: regenText,
          userMessage: input.userMessage,
          conversationContext,
          turnToolCalls: allToolCalls,
          turnToolResults: allToolResults,
          recentSuccessfulTools,
          blueprint,
          soul: soulForValidators,
        });
        if (!second.criticalFailed) {
          // Recovery succeeded — use the regenerated response.
          finalText = regenText;
          validatorResults = second.results;
          criticalFailed = false;
          console.warn(
            `[agent-runtime] critical_validator_recovered_via_regen agentId=${agent.id} convId=${conv.id}`,
          );
        } else {
          // Regenerated response ALSO failed — use per-validator
          // final fallback. Don't loop infinitely.
          const stillFailed = second.results
            .filter((v) => !v.passed)
            .map((v) => v.name);
          finalText = selectFinalFallback(stillFailed);
          validatorResults = second.results;
          console.warn(
            `[agent-runtime] critical_validator_failed_after_regen_using_fallback agentId=${agent.id} convId=${conv.id} fails=${stillFailed.join(",")}`,
          );
        }
      } else {
        // Regeneration returned no text — shouldn't happen, but fall back.
        finalText = selectFinalFallback(failedNames);
      }
    } catch (regenErr) {
      console.error(
        `[agent-runtime] regen_error agentId=${agent.id} convId=${conv.id} err=${regenErr instanceof Error ? regenErr.message : String(regenErr)}`,
      );
      finalText = selectFinalFallback(failedNames);
    }
  }

  // 8. Persist assistant turn
  const latencyMs = Date.now() - t0;
  const costCents = computeCostCents(totalTokensIn, totalTokensOut);

  await db.insert(agentTurns).values({
    conversationId: input.conversationId,
    turnIndex: nextTurnIndex + 1,
    role: "assistant",
    content: finalText,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
    toolResults: allToolResults.length > 0 ? allToolResults : null,
    validatorsPassed: validatorResults,
    latencyMs,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    // Record the model ACTUALLY used for the final call this turn (adaptive
    // selection may have escalated a hard turn to the premium model), not the
    // static default — so cost/observability reflect real spend.
    model: lastModelUsed,
  });

  // 9. Update conversation aggregates
  await db
    .update(agentConversations)
    .set({
      lastTurnAt: new Date(),
      tokensIn: sql`${agentConversations.tokensIn} + ${totalTokensIn}`,
      tokensOut: sql`${agentConversations.tokensOut} + ${totalTokensOut}`,
      llmCostCents: sql`${agentConversations.llmCostCents} + ${costCents}`,
      turnCount: sql`${agentConversations.turnCount} + 2`,
    })
    .where(eq(agentConversations.id, input.conversationId));

  // v1.27.9 — agents.tokensUsedToday increment removed (see budget note
  // above). Per-turn tokens still persist on agent_turns rows for
  // observability + cost analytics; the aggregate counter on the agents
  // table is no longer maintained.
  await db
    .update(agents)
    .set({ updatedAt: new Date() })
    .where(eq(agents.id, agent.id));

  // 10. Activity bridge — first user turn → activity row on contact's
  // timeline. Subsequent turns are aggregated for the operator review
  // surface (v1.26.1).
  if (nextTurnIndex === 0 && conv.status !== "test") {
    await writeFirstTurnActivity(agent, orgRow.id, conv.id, input.userMessage);
  }

  return {
    ok: true,
    assistantMessage: finalText,
    validators: validatorResults,
    toolCalls: allToolCalls,
    toolResults: allToolResults,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    latencyMs,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────────
// v1.27.9 — isDailyBudgetExhausted removed; see note in step 2 above.

function computeCostCents(tokensIn: number, tokensOut: number): number {
  const cents =
    (tokensIn / 1000) * COST_PER_1K_INPUT_CENTS +
    (tokensOut / 1000) * COST_PER_1K_OUTPUT_CENTS;
  return Math.ceil(cents);
}

async function writeFirstTurnActivity(
  agent: Agent,
  orgId: string,
  conversationId: string,
  firstUserMessage: string,
): Promise<void> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.orgId, orgId))
    .limit(1);
  if (!owner?.id) return;
  const preview =
    firstUserMessage.length > 200
      ? `${firstUserMessage.slice(0, 197)}...`
      : firstUserMessage;
  await db.insert(activities).values({
    orgId,
    userId: owner.id,
    type: "agent_conversation_started",
    subject: `Agent conversation: "${preview.slice(0, 60)}"`,
    body: preview,
    metadata: {
      source: "agent",
      agentId: agent.id,
      agentName: agent.name,
      conversationId,
    },
    completedAt: new Date(),
  });
  void and; // import keepalive
}

// ─── error classifier ──────────────────────────────────────────────────────
//
// v1.27.5 — categorize Anthropic API errors into operator-actionable
// classes. The runtime catches the raw error and returns:
//   - reason  (stable identifier for the UI to switch on)
//   - operatorHint (specific guidance shown in test-mode sandbox)
//
// In live/active conversations the gentle fallback fires regardless;
// only the test-mode sandbox surfaces these hints to the SF client.

type AnthropicErrorClass = {
  reason:
    | "llm_credit_exhausted"
    | "llm_invalid_key"
    | "llm_rate_limited"
    | "llm_model_unavailable"
    | "llm_overloaded"
    | "llm_timeout"
    | "llm_error";
  operatorHint: string;
};

function classifyAnthropicError(detail: string): AnthropicErrorClass {
  const lower = detail.toLowerCase();

  if (
    lower.includes("credit balance is too low") ||
    lower.includes("insufficient credits")
  ) {
    return {
      reason: "llm_credit_exhausted",
      operatorHint:
        "Anthropic account has no credits left. Add credits at " +
        "console.anthropic.com/settings/billing, then retry.",
    };
  }
  if (
    lower.includes("invalid x-api-key") ||
    lower.includes("authentication_error") ||
    lower.includes("401")
  ) {
    return {
      reason: "llm_invalid_key",
      operatorHint:
        "Anthropic API key is invalid or revoked. Update via " +
        "configure_llm_provider with a fresh sk-ant-... key.",
    };
  }
  if (lower.includes("rate_limit") || lower.includes("429")) {
    return {
      reason: "llm_rate_limited",
      operatorHint:
        "Anthropic rate limit reached. Wait ~60s and try again, or " +
        "raise your tier at console.anthropic.com.",
    };
  }
  if (lower.includes("model_not_found") || lower.includes("not_found_error")) {
    return {
      reason: "llm_model_unavailable",
      operatorHint:
        "The configured Claude model isn't available on your account tier. " +
        "Contact SF support if this persists (model is platform-controlled).",
    };
  }
  if (lower.includes("overloaded_error") || lower.includes("529")) {
    return {
      reason: "llm_overloaded",
      operatorHint:
        "Anthropic API is temporarily overloaded. Try again in a moment.",
    };
  }
  if (
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset")
  ) {
    return {
      reason: "llm_timeout",
      operatorHint:
        "Network timeout reaching Anthropic. Check your deployment's " +
        "outbound connectivity and try again.",
    };
  }

  return {
    reason: "llm_error",
    operatorHint: `Unexpected Anthropic API error: ${detail.slice(0, 200)}`,
  };
}
