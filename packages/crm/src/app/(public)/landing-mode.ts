// Pure mode resolution for the dual-path landing (spec 2026-07-13).
// Server-safe: no React, no env reads — the caller passes the flag.

export type LandingMode = "build" | "record";

export function resolveLandingMode(
  modeParam: string | string[] | undefined,
  recordEnabled: boolean,
): LandingMode {
  if (!recordEnabled) return "build";
  return modeParam === "record" ? "record" : "build";
}
