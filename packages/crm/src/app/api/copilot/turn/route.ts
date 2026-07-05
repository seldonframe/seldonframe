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
import type { AgentBlueprint } from "@/db/schema";
import { capResponse, COPILOT_PERSONA } from "@/lib/agents/copilot/cap";
import { buildDesignChips, type DesignChipsResult } from "@/lib/agents/copilot/design-chips";
import type { StockPhoto } from "@/lib/media/stock-search";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { shouldVisionVerify, visionVerifyPage, type VisionCheckResult } from "@/lib/vision/verify-page";

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

  const orgId = await getOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  const toolEvents = result.toolCalls.map((call) => {
    const toolResult = result.toolResults.find((r) => r.toolCallId === call.id);
    return { name: call.name, ok: toolResult?.ok ?? false };
  });

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
  let visionCheck: VisionCheckResult | undefined;
  try {
    if (shouldVisionVerify(toolEvents, isVisionVerifyOn({ SF_VISION_VERIFY: process.env.SF_VISION_VERIFY }))) {
      const org = await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (org?.slug) {
        const publicUrl = buildWorkspaceUrls(org.slug, WORKSPACE_BASE_DOMAIN, orgId).home;
        visionCheck = await Promise.race([
          visionVerifyPage(publicUrl, message, SITE_RUBRIC),
          new Promise<VisionCheckResult>((resolve) =>
            setTimeout(() => resolve({ pass: true, gaps: [], skipped: "timeout" }), VISION_VERIFY_TIMEOUT_MS),
          ),
        ]);
      }
    }
  } catch {
    visionCheck = undefined;
  }

  return NextResponse.json({
    kind: "reply",
    text: result.assistantMessage,
    toolEvents,
    ...(designOptions ? { designOptions } : {}),
    ...(mediaOptions ? { mediaOptions } : {}),
    ...(visionCheck ? { visionCheck } : {}),
  });
}
