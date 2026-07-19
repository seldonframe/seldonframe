// Record-to-agent ungated policy — flag + capture limits.
// Flag pattern mirrors isWebUngatedBuildOn (web-build/policy.ts): strict "1",
// so a stray "true"/"yes" in Vercel can never accidentally open the surface.

export function isRecordToAgentOn(env: {
  SF_RECORD_TO_AGENT?: string | undefined;
}): boolean {
  return env.SF_RECORD_TO_AGENT === "1";
}

/** Anonymous recording-session creation cap per IP per 24h. */
export const RECORDING_SESSIONS_PER_DAY_PER_IP = 3;

/**
 * Per-IP daily recording-session cap, env-overridable (2026-07-10 live-test
 * fix: the founder's own testing was tripping the anonymous cap). Mirrors
 * resolveWebBuildRateLimit's contract exactly: `SF_RECORD_SESSIONS_PER_DAY`
 * lets ops raise/lower the cap without a code change; falls back to the
 * compiled RECORDING_SESSIONS_PER_DAY_PER_IP (3) on absent/invalid/
 * non-positive values, so a typo'd env can never open an unlimited lane.
 */
export function resolveRecordingSessionsPerDay(env: {
  SF_RECORD_SESSIONS_PER_DAY?: string | undefined;
}): number {
  const raw = env.SF_RECORD_SESSIONS_PER_DAY?.trim();
  if (!raw) return RECORDING_SESSIONS_PER_DAY_PER_IP;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== raw) {
    return RECORDING_SESSIONS_PER_DAY_PER_IP;
  }
  return parsed;
}
/** Max recordings (slots) an operator can capture within one session. */
export const MAX_RECORDINGS_PER_SESSION = 6;
/** Auto-stop capture after this many seconds. */
export const MAX_RECORDING_SECONDS = 300;
/** Max keyframes accepted per recording. */
export const MAX_FRAMES_PER_RECORDING = 240;
/** Downscale keyframes so neither edge exceeds this many pixels. */
export const MAX_FRAME_EDGE_PX = 1280;
/** Max interview chat turns allowed per session. */
export const MAX_INTERVIEW_TURNS = 30;

/** Client-safe copy of the recording video size cap. The server truth lives
 *  in lib/media/resolve-url.ts (VIDEO_MAX_BYTES) — but that module's import
 *  chain (page-blocks/images → landing/set-r1-media → next/cache
 *  revalidatePath) is server-only, and importing it from record-client.tsx
 *  broke `next build` (L-18 class: client bundle pulling a server-only API;
 *  tsc can't see it). Keep the two values in sync; route-guards.ts asserts
 *  the server side. */
export const RECORDING_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
