// POST /api/copilot/turn — authed SeldonChat dock turn endpoint
// (win-ladder P0/Task 3). Flag-dark: 404 when SF_WIN_LADDER isn't "1".
//
// body: { message: string }
// response:
//   { kind: "reply", text, toolEvents: { name, ok }[] }
//   { kind: "capped", used, limit, upgrade }   — 20 turns/org/day, still 200
//
// Runs on the existing executeTurn agent runtime (same conversation/turn/
// validator plumbing every other agent gets) against the ONE hidden
// "workspace_copilot" agent per org (ensureWorkspaceCopilotAgent, T2). The
// copilot's persona (never-lies / confirm-before-destructive / act-then-
// report) is threaded through blueprintOverride.customSkillMd — the same
// operator-instructions seam composeSystemPrompt already honors for every
// operator-edited SKILL.md (see prompt.ts). No new runtime params.

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { isVisionVerifyOn, isWinLadderOn } from "@/lib/web-build/policy";
import { ensureWorkspaceCopilotAgent } from "@/lib/agents/copilot/ensure-agent";
import { COPILOT_CAPABILITY } from "@/lib/agents/copilot/tools";
import { executeTurn } from "@/lib/agents/runtime";
import type { AgentBlueprint, AgentToolCall, AgentToolResult } from "@/db/schema";
import { capResponse, COPILOT_PERSONA } from "@/lib/agents/copilot/cap";
import { buildDesignChips, type DesignChipsResult } from "@/lib/agents/copilot/design-chips";
import type { StockPhoto } from "@/lib/media/stock-search";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { shouldVisionVerify, visionVerifyPage, buildVisionCheckLog, type VisionCheckResult } from "@/lib/vision/verify-page";
import { reconcileReplyWithVision } from "@/lib/vision/reconcile-reply";
import { persistReflection } from "@/lib/vision/persist-reflection";
import { logEvent } from "@/lib/observability/log";

export const runtime = "nodejs";

const DAILY_TURN_LIMIT = 20;
const DAILY_TURN_WINDOW_MS = 86_400_000;
const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
/** Hard overall cap for the vision-verify side-check so a slow render/grade
 *  can never meaningfully delay the copilot reply — see verify-page.ts for
 *  the per-step fail-soft guarantees this backstops. */
const VISION_VERIFY_TIMEOUT_MS = 15_000;
/** Generic site rubric for the post-edit confirm — kept intentionally broad
 *  (per-surface rubrics are a follow-on; the spike doc flags rubric quality
 *  as the main risk for false pos/neg). */
const SITE_RUBRIC =
  "The requested change is visibly present on the page. No broken or missing " +
  "images/videos, no illegible or low-contrast text, no obviously empty or " +
  "garbled sections, no overlapping layout.";

type Body = {
  message?: string;
};

export async function POST(request: NextRequest) {
  if (!isWinLadderOn({ SF_WIN_LADDER: process.env.SF_WIN_LADDER })) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const orgIdOrNull = await getOrgId();
  if (!orgIdOrNull) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Re-bound to a `string`-typed const (never reassigned) so the narrowing
  // above is visible inside the nested runVisionCheck closure below — TS
  // can't otherwise prove a `let`/`const`-from-a-nullable-fn stays non-null
  // across a function-declaration boundary.
  const orgId: string = orgIdOrNull;
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "missing_message" }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `copilot-daily:${orgId}`,
    DAILY_TURN_LIMIT,
    DAILY_TURN_WINDOW_MS,
  );
  if (!allowed) {
    return NextResponse.json(capResponse(DAILY_TURN_LIMIT));
  }

  const { conversationIdFor } = await ensureWorkspaceCopilotAgent(orgId);
  const conversationId = await conversationIdFor(user.id);

  const blueprintOverride: AgentBlueprint = {
    capabilities: [COPILOT_CAPABILITY],
    customSkillMd: COPILOT_PERSONA,
  };

  const result = await executeTurn({
    conversationId,
    userMessage: message,
    blueprintOverride,
  });

  if (!result.ok) {
    return NextResponse.json({
      kind: "reply",
      text: result.fallbackMessage,
      toolEvents: [],
    });
  }

  // Render list_designs' result as clickable chips instead of letting the
  // model verbalize the raw tool JSON as a markdown table (see
  // design-chips.ts). Omitted entirely when no list_designs call happened
  // this turn, or when its result wasn't a successful list.
  let designOptions: DesignChipsResult | undefined;
  const listDesignsCall = result.toolCalls.find((call) => call.name === "list_designs");
  if (listDesignsCall) {
    const toolResult = result.toolResults.find((r) => r.toolCallId === listDesignsCall.id);
    if (toolResult?.ok) {
      const chips = buildDesignChips(toolResult.output);
      if (chips.chips.length > 0) {
        designOptions = chips;
      }
    }
  }

  // Render search_media's result as clickable thumbnails instead of letting
  // the model verbalize stock-photo URLs as prose (same rationale as
  // designOptions above). Omitted entirely when no search_media call
  // happened this turn, or when it returned zero photos.
  let mediaOptions: { slot: string; photos: StockPhoto[] } | undefined;
  const searchMediaCall = result.toolCalls.find((call) => call.name === "search_media");
  if (searchMediaCall) {
    const toolResult = result.toolResults.find((r) => r.toolCallId === searchMediaCall.id);
    if (toolResult?.ok) {
      const output = toolResult.output as
        | { ok?: boolean; target_slot?: string; photos?: StockPhoto[] }
        | undefined;
      const photos = Array.isArray(output?.photos) ? output.photos : [];
      if (output?.ok === true && photos.length > 0) {
        mediaOptions = {
          slot: typeof output.target_slot === "string" ? output.target_slot : "hero_background",
          photos,
        };
      }
    }
  }

  // Track B P1 (vision-verify product feature, 2026-07-05) — after a
  // SeldonChat edit that changed the public site, screenshot the live
  // preview and grade it with an independent vision pass, so "done" is
  // backed by actually seeing the result. Flag-gated + fail-soft: wrapped
  // in its own try/catch + hard timeout, and `visionCheck` is only attached
  // when the check actually ran — any error here must never fail the turn.
  //
  // Observability: emit a `vision_check` structured log (same convention as
  // `media_update` via lib/observability/log.ts's logEvent) whenever a
  // preview-busting edit happened this turn — flag ON records fired:true +
  // the verdict, flag OFF records fired:false, making both "did it run" and
  // "is the flag on" visible in Vercel logs. Logging itself is wrapped in
  // its own try/catch so it can never throw or slow the reply.
  //
  // Factored into a helper (never-lies L2b, 2026-07-06) so the SAME
  // fail-soft render+grade+log logic can be reused for the single
  // self-correction retry below, without duplicating the try/catch/timeout
  // plumbing.
  async function runVisionCheck(
    toolCallsThisTurn: AgentToolCall[],
    toolResultsThisTurn: AgentToolResult[],
    goalMessage: string,
  ): Promise<VisionCheckResult | undefined> {
    let check: VisionCheckResult | undefined;
    try {
      const flagOn = isVisionVerifyOn({ SF_VISION_VERIFY: process.env.SF_VISION_VERIFY });
      const events = toolCallsThisTurn.map((call) => {
        const toolResult = toolResultsThisTurn.find((r) => r.toolCallId === call.id);
        return { name: call.name, ok: toolResult?.ok ?? false };
      });
      const editHappened = shouldVisionVerify(events, true);

      if (editHappened) {
        const triggerCall = toolCallsThisTurn.find((call) =>
          /^(edit_|update_|move_|delete_|add_|undo_)/.test(call.name),
        );
        const triggerResult = triggerCall
          ? toolResultsThisTurn.find((r) => r.toolCallId === triggerCall.id)
          : undefined;
        const triggerOutput = triggerResult?.output as { slot?: string } | undefined;
        const triggerTool = triggerCall?.name ?? null;
        const triggerSlot = typeof triggerOutput?.slot === "string" ? triggerOutput.slot : null;

        if (!flagOn) {
          try {
            const record = buildVisionCheckLog({
              orgId,
              fired: false,
              durationMs: 0,
              triggerTool,
              triggerSlot,
            });
            logEvent("vision_check", record, { orgId, severity: "info" });
          } catch {
            // Logging must never affect the reply.
          }
        } else {
          const startedAt = Date.now();
          try {
            const org = await db
              .select({ slug: organizations.slug })
              .from(organizations)
              .where(eq(organizations.id, orgId))
              .limit(1)
              .then((rows) => rows[0] ?? null);

            if (org?.slug) {
              const publicUrl = buildWorkspaceUrls(org.slug, WORKSPACE_BASE_DOMAIN, orgId).home;
              let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                check = await Promise.race([
                  visionVerifyPage(publicUrl, goalMessage, SITE_RUBRIC),
                  new Promise<VisionCheckResult>((resolve) => {
                    timer = setTimeout(() => resolve({ pass: true, gaps: [], skipped: "timeout" }), VISION_VERIFY_TIMEOUT_MS);
                  }),
                ]);
              } finally {
                clearTimeout(timer);
              }
            }
          } finally {
            try {
              const record = buildVisionCheckLog({
                orgId,
                fired: true,
                verdict: check,
                durationMs: Date.now() - startedAt,
                triggerTool,
                triggerSlot,
              });
              logEvent("vision_check", record, { orgId, severity: "info" });
              // Dream-loop prerequisite (2026-07-06) — dual-write the same
              // verdict into agent_reflection_events so the daily dream
              // routine has a queryable collect source. Fail-soft: wrapped in
              // the same try/catch as the log line above, and persistReflection
              // itself never throws (see persist-reflection.ts). Only persists
              // when a real grade ran (`check` defined) — a skipped/never-ran
              // check has nothing to cluster.
              if (check) {
                await persistReflection({
                  orgId,
                  surface: "copilot",
                  instruction: goalMessage,
                  triggerTool,
                  verdict: check,
                });
              }
            } catch {
              // Logging must never affect the reply.
            }
          }
        }
      }
    } catch {
      check = undefined;
    }
    return check;
  }

  let visionCheck = await runVisionCheck(result.toolCalls, result.toolResults, message);

  // Never-lies L2b (2026-07-06) — single bounded self-correction retry.
  // If the FIRST turn made an edit-type tool call and the vision check came
  // back as a genuine (non-skipped) failure, re-invoke executeTurn exactly
  // ONCE with the gaps + a field-name hint appended, then re-run vision on
  // the retry's result. Entirely inside its own try/catch so any throw or
  // slow path here falls back to the first turn's result — the retry must
  // never be able to make the response worse than not retrying at all.
  // Gated behind the same isVisionVerifyOn flag as the check itself.
  let finalResult = result;
  if (
    isVisionVerifyOn({ SF_VISION_VERIFY: process.env.SF_VISION_VERIFY }) &&
    visionCheck &&
    visionCheck.pass === false &&
    !visionCheck.skipped &&
    // Only auto-retry NON-destructive edits. A failed move_/delete_/undo_ must
    // not be re-run (the retry re-invokes the full agent and could delete/move
    // a second section) — destructive ops need explicit operator intent, not a
    // silent second attempt. (delete_section also needs confirm:true, which the
    // retry won't carry; this is defense-in-depth on top of that.)
    result.toolCalls.some((call) => /^(edit_|update_|add_)/.test(call.name))
  ) {
    try {
      const retryInstruction =
        `Your last edit did not appear on the live page. The visual check reported: ${visionCheck.gaps.join("; ")}. ` +
        "On this site the hero headline is the `tagline` field (there is no \"headline\" field); " +
        "use get_site_structure to see the real fields, then use update_section_field with the correct field.";

      const retryResult = await executeTurn({
        conversationId,
        userMessage: retryInstruction,
        blueprintOverride,
        // EPHEMERAL — the retryInstruction is SYNTHETIC coaching text, not
        // operator input. persist:false so it's never written to agentTurns and
        // can't leak into future turns' history as prior USER context. The retry
        // still runs the real tools against the live workspace and is re-graded.
        persist: false,
      });

      if (retryResult.ok) {
        // Grade the retry against the ORIGINAL user intent (`message`), NOT
        // the synthetic retry instruction — otherwise the vision check would
        // verify the page against "your last edit didn't appear…" meta-text
        // and could falsely pass, re-reporting a still-broken edit as done.
        const retryVisionCheck = await runVisionCheck(
          retryResult.toolCalls,
          retryResult.toolResults,
          message,
        );
        finalResult = retryResult;
        visionCheck = retryVisionCheck;
      }
      // retryResult.ok === false → keep the first result/visionCheck as-is.
    } catch {
      // Any retry failure (throw, timeout, etc.) falls back to the first
      // turn's result/visionCheck — never crash the turn over a retry.
      finalResult = result;
    }
  }

  const toolEvents = finalResult.toolCalls.map((call) => {
    const toolResult = finalResult.toolResults.find((r) => r.toolCallId === call.id);
    return { name: call.name, ok: toolResult?.ok ?? false };
  });

  const reconciled = reconcileReplyWithVision(finalResult.assistantMessage, visionCheck);

  return NextResponse.json({
    kind: "reply",
    text: reconciled.text,
    toolEvents,
    ...(designOptions ? { designOptions } : {}),
    ...(mediaOptions ? { mediaOptions } : {}),
    ...(visionCheck ? { visionCheck } : {}),
  });
}
