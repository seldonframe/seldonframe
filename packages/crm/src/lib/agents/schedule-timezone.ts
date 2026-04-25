// Timezone resolution for scheduled triggers.
// SLICE 5 PR 1 C3 per audit §3.4 + G-5-1.
//
// Fallback chain per gate resolution:
//   1. If the trigger specifies a timezone AND it's a valid IANA name,
//      use it.
//   2. Else if the workspace has a timezone AND it's valid IANA, use it.
//   3. Else default to "UTC".
//
// Invalid IANA strings at any level are skipped rather than throwing —
// the schema validator is the authoritative guard against ever-storing
// bad timezones (C2 ScheduleTriggerSchema validates trigger.timezone;
// organizations.timezone defaults to "UTC" so existing workspaces are
// always valid). The fallback chain here is defense-in-depth for edge
// cases like manual DB edits or future soft validations.

import { isValidIanaTimezone } from "./cron";

export function resolveScheduleTimezone(opts: {
  triggerTimezone?: string | null;
  workspaceTimezone?: string | null;
}): string {
  const t = opts.triggerTimezone;
  if (typeof t === "string" && t.length > 0 && isValidIanaTimezone(t)) {
    return t;
  }
  const w = opts.workspaceTimezone;
  if (typeof w === "string" && w.length > 0 && isValidIanaTimezone(w)) {
    return w;
  }
  return "UTC";
}
