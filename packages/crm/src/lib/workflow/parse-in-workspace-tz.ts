// Parse a naive ISO datetime string (no timezone suffix) as wall-clock
// time in the given IANA timezone. Returns a Date representing that
// instant.
//
// Strategy:
//   1. If the input already has a TZ designator (Z or ±HH:MM), pass
//      through to `new Date()` — the user/LLM was explicit.
//   2. Otherwise, treat the input as wall-clock time in `timezone`.
//      Parse the components, build a UTC instant from them, then
//      adjust by the workspace's UTC offset AT that wall-clock time
//      (accounts for DST).
//
// Used by the agent's create_booking handler so LLM-emitted naive
// ISO strings ("2026-05-20T13:00:00") are interpreted in the workspace's
// timezone rather than UTC — closes the bug where a 1pm booking landed
// at 8 AM because the server runs in UTC.

const HAS_TZ_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/;

export function parseInWorkspaceTimezone(iso: string, timezone: string): Date {
  if (HAS_TZ_SUFFIX.test(iso)) {
    return new Date(iso);
  }

  // Parse naive components by appending Z (treat as UTC for the GUESS),
  // then adjust for the workspace's offset.
  const utcGuess = new Date(iso + "Z");
  if (Number.isNaN(utcGuess.getTime())) {
    return utcGuess; // invalid input — return Invalid Date
  }

  // Compute the workspace's offset at this wall-clock moment. We need
  // longOffset format ("GMT-05:00") which Intl supports.
  let offsetMinutes = 0;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    });
    const parts = fmt.formatToParts(utcGuess);
    const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
    const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const hh = parseInt(match[2], 10);
      const mm = match[3] ? parseInt(match[3], 10) : 0;
      offsetMinutes = sign * (hh * 60 + mm);
    }
  } catch {
    // Invalid tz string — fall back to UTC (offsetMinutes stays 0)
  }

  // utcGuess represents the components as IF they were UTC. The actual
  // instant where the workspace clock reads those components is
  // offsetMinutes earlier (because negative offsets mean west of UTC,
  // and a 13:00 wall-clock at offset -5 is 18:00 UTC, i.e. +5 hours
  // from the UTC interpretation of 13:00).
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}
