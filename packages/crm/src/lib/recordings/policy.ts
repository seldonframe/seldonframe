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
