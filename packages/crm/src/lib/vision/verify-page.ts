// lib/vision/verify-page.ts — Track B P1 (vision-verify product feature).
//
// After a SeldonChat edit that changed the public site, screenshot the live
// preview and grade it with an independent vision pass, so the copilot's
// "done" is backed by actually SEEING the result — not just a tool-success
// bit (see docs/superpowers/specs/2026-07-05-vision-verify-spike.md, "product
// feature — the never-lies pillar, made mechanical").
//
// FAIL-SOFT IS THE RULE. A screenshot outage, a slow grader, or garbled model
// output must NEVER block, slow, or error the copilot turn:
//   - renderScreenshot: wraps the whole render in a ~15s AbortController
//     timeout + try/catch. Any failure → {ok:false}, never throws.
//   - gradeScreenshot: wraps the anthropic call in try/catch. Any failure →
//     {pass:true, gaps:[]} (never blocks on a grader hiccup).
//   - parseVisionVerdict: tolerates code fences / prose around the JSON;
//     unparseable output → {pass:true, gaps:[]}.
//   - visionVerifyPage: a render failure short-circuits with
//     {pass:true, gaps:[], skipped:"render_failed"} — never calls the
//     grader on nothing, never surfaces a failure to the user.
//
// The route (api/copilot/turn/route.ts) wraps the whole visionVerifyPage
// call in its own try/catch + timeout and only attaches `visionCheck` when
// it actually ran — the copilot's reply is never held hostage by this.

import Anthropic from "@anthropic-ai/sdk";

export type RenderResult =
  | { ok: true; base64: string; mediaType: string }
  | { ok: false; error: string };

export type VisionVerdict = { pass: boolean; gaps: string[] };

export type VisionCheckResult = VisionVerdict & { skipped?: string };

const VISION_MODEL = "claude-haiku-4-5-20251001";
const RENDER_TIMEOUT_MS = 15_000;
const MICROLINK_ENDPOINT = "https://api.microlink.io/";

type RenderDeps = {
  fetchImpl?: typeof fetch;
  apiKey?: string;
};

type GradeDeps = {
  anthropic?: Pick<Anthropic, "messages">;
};

/**
 * True iff a public-site-changing edit happened THIS turn: the flag is on
 * AND at least one toolEvent both succeeded and matches the same mutating
 * verb prefixes the client's shouldBustPreview already uses
 * (seldon-chat.tsx) — read-only turns (get_ and list_ prefixes) and failed
 * edits never trigger a vision check.
 */
export function shouldVisionVerify(
  toolEvents: { name: string; ok: boolean }[],
  flagOn: boolean,
): boolean {
  if (!flagOn) return false;
  return toolEvents.some((event) => event.ok && /^(edit_|update_|move_|delete_|add_|undo_)/.test(event.name));
}

/** Pure prompt builder — the goal + rubric drive the grade; kept pure and
 *  DI-free so it's trivially unit-testable without any network. */
export function buildVisionGradePrompt(goal: string, rubric: string): string {
  return [
    "You are an independent visual QA reviewer for a live website screenshot.",
    "You did NOT make this change — grade it fresh, the way a skeptical reviewer would.",
    "",
    `The requested change was: "${goal}"`,
    "",
    "Rubric — check the screenshot against ALL of these:",
    rubric,
    "",
    "Look for: broken/missing images, garbled or overlapping layout, illegible or low-contrast text,",
    "empty sections, or anything that plainly does not match the requested change.",
    "",
    "Respond with STRICT JSON ONLY, no prose, no code fences, matching exactly this shape:",
    '{"pass": boolean, "gaps": string[]}',
    "",
    '"pass" is true only if the change is visibly present and nothing on the rubric is broken.',
    '"gaps" is a short list of plain-language issues (empty array if pass is true).',
  ].join("\n");
}

/**
 * Extracts the first JSON object from a model reply and coerces it into a
 * VisionVerdict. Tolerates code fences and surrounding prose. Fail-soft:
 * ANY parse failure (no JSON found, malformed JSON, wrong shape) defaults to
 * {pass:true, gaps:[]} — a grader hiccup must never block the copilot.
 */
export function parseVisionVerdict(text: string): VisionVerdict {
  const fallback: VisionVerdict = { pass: true, gaps: [] };
  if (!text) return fallback;

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return fallback;

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!parsed || typeof parsed !== "object") return fallback;
    const obj = parsed as Record<string, unknown>;
    const pass = typeof obj.pass === "boolean" ? obj.pass : true;
    const gaps = Array.isArray(obj.gaps)
      ? obj.gaps.filter((g): g is string => typeof g === "string")
      : [];
    return { pass, gaps };
  } catch {
    return fallback;
  }
}

/**
 * Calls Claude vision (cheap haiku model) with the screenshot + a prompt
 * built from the goal/rubric, and parses the strict-JSON verdict. DI's the
 * anthropic client so tests need no network. Fail-soft: any error (network,
 * API, malformed response) → {pass:true, gaps:[]}.
 */
export async function gradeScreenshot(
  base64: string,
  mediaType: string,
  goal: string,
  rubric: string,
  deps: GradeDeps = {},
): Promise<VisionVerdict> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const client = deps.anthropic ?? (apiKey ? new Anthropic({ apiKey }) : null);
    if (!client) return { pass: true, gaps: [] };

    const prompt = buildVisionGradePrompt(goal, rubric);
    const response = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: base64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    return parseVisionVerdict(textBlock?.text ?? "");
  } catch {
    return { pass: true, gaps: [] };
  }
}

/**
 * Renders a public URL to a screenshot via microlink (same service/shape as
 * the dev-loop scripts/vision-shot.mjs helper) — the reliable off-box render
 * path since Chrome-MCP screenshotting is flaky here (clip.scale CDP bug +
 * backgrounded-tab 0-viewport). Cache-busts the target url so a just-applied
 * edit is captured fresh. Fail-soft: wrapped in a ~15s AbortController
 * timeout + try/catch — NEVER throws, always resolves to a result object.
 */
export async function renderScreenshot(url: string, deps: RenderDeps = {}): Promise<RenderResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? process.env.MICROLINK_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);

  try {
    const cacheBust = Math.floor(Math.random() * 1e9);
    const sep = url.includes("?") ? "&" : "?";
    const target = `${url}${sep}vcb=${cacheBust}`;
    const api =
      `${MICROLINK_ENDPOINT}?url=${encodeURIComponent(target)}` +
      "&screenshot=true&meta=false&viewport.width=1280&viewport.height=900&waitUntil=networkidle2";
    const headers = apiKey ? { "x-api-key": apiKey } : undefined;

    const metaResponse = await fetchImpl(api, { headers, signal: controller.signal });
    const meta = (await metaResponse.json()) as {
      status?: string;
      message?: string;
      data?: { screenshot?: { url?: string } };
    };

    const shotUrl = meta?.data?.screenshot?.url;
    if (meta.status !== "success" || !shotUrl) {
      return { ok: false, error: `microlink render failed: status=${meta.status ?? "unknown"} ${meta.message ?? ""}`.trim() };
    }

    const imageResponse = await fetchImpl(shotUrl, { signal: controller.signal });
    if (!imageResponse.ok) {
      return { ok: false, error: `screenshot fetch failed: status=${imageResponse.status}` };
    }
    const buffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = shotUrl.endsWith(".jpg") || shotUrl.endsWith(".jpeg") ? "image/jpeg" : "image/png";

    return { ok: true, base64, mediaType };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The end-to-end check: render → grade → verdict. Fail-soft at every step —
 * a render failure short-circuits to {pass:true, gaps:[], skipped:
 * "render_failed"} WITHOUT calling the grader, so a screenshot outage never
 * degrades or blocks the copilot's reply.
 */
export async function visionVerifyPage(
  url: string,
  goal: string,
  rubric: string,
  deps: RenderDeps & GradeDeps = {},
): Promise<VisionCheckResult> {
  const rendered = await renderScreenshot(url, deps);
  if (!rendered.ok) {
    return { pass: true, gaps: [], skipped: "render_failed" };
  }

  const verdict = await gradeScreenshot(rendered.base64, rendered.mediaType, goal, rubric, deps);
  return verdict;
}
