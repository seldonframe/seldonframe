// packages/crm/src/lib/workspace/format-hours.ts
//
// 2026-05-15 — Compact human-readable summary of a weekly availability map.
// Used by the workspace snapshot endpoint to produce
// `booking.hours_summary` strings like "Mon-Fri 7-5, Sat 8-12" that the
// MCP finalize_workspace handler embeds in the operator-facing summary.
//
// Spec: docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md

type DayName =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type DaySpec = { enabled: boolean; start: string; end: string };

export type WeeklyHours = Partial<Record<DayName, DaySpec>>;

const ORDER: DayName[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const SHORT: Record<DayName, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

/** Format "HH:MM" → 12-hour-ish short label without leading zeros or AM/PM.
 *  09:00 → "9", 17:00 → "5", 23:59 → "12", 14:30 → "2:30". */
function shortHour(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  // Special case: 23:59 (end-of-day sentinel) displays as 12 (midnight)
  if (h === 23 && m === 59) return "12";
  // Convert 24h → 12h-ish: 0/12/24 → 12, 13-23 → h-12, 1-11 → h.
  let display = h % 12;
  if (display === 0) display = 12;
  if (Number.isNaN(m) || m === 0) return String(display);
  return `${display}:${String(m).padStart(2, "0")}`;
}

/**
 * Build a compact human-readable summary of a weekly availability map.
 *
 * Returns:
 *   - "by appointment" when no day is enabled
 *   - "Mon-Fri 9-5" for a contiguous run sharing the same hours
 *   - "Mon-Fri 9-5, Sat 8-12" for adjacent runs with different hours
 *   - "Mon, Wed, Fri 9-5" when enabled days are non-contiguous
 */
export function summarizeWeeklyHours(hours: WeeklyHours): string {
  // Collect enabled days in week order with their hour fingerprint.
  const enabled: Array<{ day: DayName; key: string; start: string; end: string }> = [];
  for (const day of ORDER) {
    const spec = hours[day];
    if (spec?.enabled) {
      enabled.push({
        day,
        key: `${spec.start}-${spec.end}`,
        start: spec.start,
        end: spec.end,
      });
    }
  }
  if (enabled.length === 0) return "by appointment";

  // Group consecutive days with the same hours into runs. A "run" is a
  // maximal contiguous (by ORDER index) sequence where the hour-key is
  // identical AND the previous day in ORDER is also in the run.
  type Run = {
    days: DayName[];
    start: string;
    end: string;
    contiguous: boolean;
  };
  const runs: Run[] = [];
  for (let i = 0; i < enabled.length; i++) {
    const e = enabled[i];
    const last = runs[runs.length - 1];
    const prevDayIdx = i > 0 ? ORDER.indexOf(enabled[i - 1].day) : -2;
    const currDayIdx = ORDER.indexOf(e.day);
    const adjacent = currDayIdx === prevDayIdx + 1;
    const sameHours = last && last.start === e.start && last.end === e.end;
    if (last && sameHours && adjacent && last.contiguous) {
      last.days.push(e.day);
    } else {
      runs.push({ days: [e.day], start: e.start, end: e.end, contiguous: adjacent || runs.length === 0 });
      // If a brand new run started because of a gap, mark non-contiguous
      // so subsequent days don't merge across the gap.
      if (last && !adjacent) {
        runs[runs.length - 1].contiguous = false;
      }
    }
  }

  // If everything ended up in ONE non-contiguous run (e.g. Mon/Wed/Fri
  // all at 9-5 — the loop above splits these into 3 single-day runs
  // because of the contiguity check). Detect that case and re-merge for
  // the "Mon, Wed, Fri 9-5" rendering.
  const allSameHours = runs.every(
    (r) => r.start === runs[0].start && r.end === runs[0].end
  );
  if (allSameHours && runs.length > 1) {
    const allDays = runs.flatMap((r) => r.days);
    const allContiguous = allDays.every((d, idx) => {
      if (idx === 0) return true;
      return ORDER.indexOf(d) === ORDER.indexOf(allDays[idx - 1]) + 1;
    });
    if (!allContiguous) {
      // Render as "Day1, Day2, Day3 H-H".
      return `${allDays.map((d) => SHORT[d]).join(", ")} ${shortHour(runs[0].start)}-${shortHour(runs[0].end)}`;
    }
  }

  // Otherwise, render each run as "Mon-Fri H-H" or "Mon H-H" and comma-join.
  return runs
    .map((run) => {
      const dayLabel =
        run.days.length === 1
          ? SHORT[run.days[0]]
          : `${SHORT[run.days[0]]}-${SHORT[run.days[run.days.length - 1]]}`;
      return `${dayLabel} ${shortHour(run.start)}-${shortHour(run.end)}`;
    })
    .join(", ");
}
