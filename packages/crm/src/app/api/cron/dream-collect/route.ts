import { collectRecentReflections } from "@/lib/vision/collect-reflections";
import { summarizeReflections } from "@/lib/vision/summarize-reflections";

export const runtime = "nodejs";

// Read-only export endpoint for the /dream reflection loop's "Collect" step.
// The daily `dream-daily` routine curls this (with the CRON_SECRET) instead of
// holding prod DB credentials — the routine environment stays credential-free.
// See docs/superpowers/specs/2026-07-06-dream-loop-design.md and
// .claude/skills/dream/SKILL.md.
//
// Auth is FAIL-CLOSED (like /api/cron/gc-seldonchat-blobs): an unset
// CRON_SECRET denies rather than allows, because this returns operator edit
// instructions (already truncated to instruction_summary at persist time, but
// still internal data). Accepts `Authorization: Bearer $CRON_SECRET` or the
// `x-cron-secret` header. This is NOT a Vercel-scheduled cron (no vercel.json
// entry) — it's an on-demand data endpoint the dream routine pulls.

let warnedMissingSecret = false;

function isAuthorized(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    if (!warnedMissingSecret) {
      console.warn(
        "[dream-collect] CRON_SECRET is unset — fail-closed, denying all requests. This endpoint exposes internal reflection data.",
      );
      warnedMissingSecret = true;
    }
    return false;
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) return true;
  return request.headers.get("x-cron-secret") === configuredSecret;
}

const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 30; // 30 days — a hard bound on the scan window.

function parseWindowHours(request: Request): number {
  const raw = new URL(request.url).searchParams.get("sinceHours");
  const n = raw ? Number(raw) : DEFAULT_WINDOW_HOURS;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WINDOW_HOURS;
  return Math.min(Math.floor(n), MAX_WINDOW_HOURS);
}

async function run(request: Request): Promise<Response> {
  const windowHours = parseWindowHours(request);
  const sinceMs = Date.now() - windowHours * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  const reflections = await collectRecentReflections(sinceIso);
  const summary = summarizeReflections(reflections);

  return Response.json({
    since: sinceIso,
    window_hours: windowHours,
    summary,
    count: reflections.length,
    reflections,
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run(request);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run(request);
}
