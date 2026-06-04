/**
 * parseHoursText — convert a free-text weekly hours answer into the
 * AvailabilitySchedule shape used by the booking engine.
 *
 * Examples handled:
 *   "Mon-Fri 9-5, Sat 10-2, closed Sun"
 *   "Monday through Friday 9am-5pm"
 *   "we're flexible"   → default Mon-Fri 09:00-17:00, weekends off
 */

export type DayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type DaySettings = {
  enabled: boolean;
  start: string; // "HH:MM" 24-hour zero-padded
  end: string;   // "HH:MM" 24-hour zero-padded
};

export type WeeklyAvailability = Record<DayKey, DaySettings>;

// ── constants ────────────────────────────────────────────────────────────────

const ALL_DAYS: DayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const DAY_INDEX: Record<DayKey, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Map every abbreviation / alias to a canonical DayKey
const NAME_TO_DAY: Record<string, DayKey> = {
  sun: "sunday",
  sunday: "sunday",
  mon: "monday",
  monday: "monday",
  tue: "tuesday",
  tues: "tuesday",
  tuesday: "tuesday",
  wed: "wednesday",
  weds: "wednesday",
  wednesday: "wednesday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  thursday: "thursday",
  fri: "friday",
  friday: "friday",
  sat: "saturday",
  saturday: "saturday",
};

const DEFAULT_SETTINGS: DaySettings = { enabled: true, start: "09:00", end: "17:00" };
const WEEKEND_DEFAULT: DaySettings = { enabled: false, start: "09:00", end: "17:00" };

function defaultSchedule(): WeeklyAvailability {
  return {
    sunday: { ...WEEKEND_DEFAULT },
    monday: { ...DEFAULT_SETTINGS },
    tuesday: { ...DEFAULT_SETTINGS },
    wednesday: { ...DEFAULT_SETTINGS },
    thursday: { ...DEFAULT_SETTINGS },
    friday: { ...DEFAULT_SETTINGS },
    saturday: { ...WEEKEND_DEFAULT },
  };
}

// ── time parsing ─────────────────────────────────────────────────────────────

/**
 * Convert "9", "9am", "9pm", "14", "09:00" → "HH:MM" (24h).
 * Returns null when the input isn't recognisable.
 */
function parseTimeToken(raw: string): string | null {
  const s = raw.trim().toLowerCase();

  // already HH:MM
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":").map(Number);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const ampm = /^(\d{1,2})([ap]m?)$/.exec(s);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const meridiem = ampm[2];
    if (meridiem.startsWith("p") && h !== 12) h += 12;
    if (meridiem.startsWith("a") && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }

  const plain = /^(\d{1,2})$/.exec(s);
  if (plain) {
    const h = parseInt(plain[1], 10);
    // Heuristic: 1-8 with no meridiem → PM (e.g. "5" → 17:00, "1" → 13:00)
    // 9-12 → AM; 13-23 → 24h already
    let hour = h;
    if (h >= 1 && h <= 8) hour = h + 12;
    return `${String(hour).padStart(2, "0")}:00`;
  }

  return null;
}

/** Parse "9-5", "9am-5pm", "09:00-17:00" → { start, end } or null. */
function parseTimeRange(raw: string): { start: string; end: string } | null {
  // split on " - " or "-" but not inside a day-range context (handled upstream)
  const parts = raw.split(/\s*-\s*/);
  if (parts.length !== 2) return null;
  const start = parseTimeToken(parts[0]);
  const end = parseTimeToken(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

// ── day range expansion ───────────────────────────────────────────────────────

/** "Mon-Fri" → ["monday","tuesday","wednesday","thursday","friday"] */
function expandDayRange(from: DayKey, to: DayKey): DayKey[] {
  const start = DAY_INDEX[from];
  const end = DAY_INDEX[to];
  if (start <= end) {
    return ALL_DAYS.slice(start, end + 1);
  }
  // wrap-around e.g. Fri-Mon
  return [...ALL_DAYS.slice(start), ...ALL_DAYS.slice(0, end + 1)];
}

// ── token classifier ─────────────────────────────────────────────────────────

/**
 * Recognise day name(s) at the start of a chunk.
 * Returns { days: DayKey[], rest: string } where rest is the remainder
 * (possibly a time range), or null if no day found.
 */
function extractDays(chunk: string): { days: DayKey[]; rest: string } | null {
  // Pattern: optional "closed" prefix  then  Day(-Day)?  then remainder
  // e.g. "closed Sun", "Mon-Fri 9-5", "Sat 10-2"
  const re =
    /^(closed\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)(?:\s*[-–]\s*(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?))?(.*)/i;

  const m = re.exec(chunk.trim());
  if (!m) return null;

  const closed = Boolean(m[1]);
  const fromKey = NAME_TO_DAY[m[2].toLowerCase()];
  const toKey = m[3] ? NAME_TO_DAY[m[3].toLowerCase()] : undefined;
  const rest = m[4]?.trim() ?? "";

  if (!fromKey) return null;

  const days = toKey ? expandDayRange(fromKey, toKey) : [fromKey];

  return { days: closed ? days.map(d => d) : days, rest };
}

// ── main parser ───────────────────────────────────────────────────────────────

export function parseHoursText(text: string): WeeklyAvailability {
  const schedule = defaultSchedule();
  const mentionedDays = new Set<DayKey>();

  // Split on commas; also try newlines
  const chunks = text.split(/[,\n]+/).map(c => c.trim()).filter(Boolean);

  for (const chunk of chunks) {
    const dayResult = extractDays(chunk);
    if (!dayResult) continue;

    const { days, rest } = dayResult;

    // check for "closed" keyword
    const isClosed =
      /\bclosed\b/i.test(chunk) && !rest.trim();

    for (const day of days) {
      mentionedDays.add(day);

      if (isClosed || /\bclosed\b/i.test(chunk.replace(rest, ""))) {
        schedule[day] = { enabled: false, start: "09:00", end: "17:00" };
        continue;
      }

      const timeRange = parseTimeRange(rest);
      if (timeRange) {
        schedule[day] = { enabled: true, start: timeRange.start, end: timeRange.end };
      } else {
        // day mentioned without times → keep default enabled/times
        const isWeekend = day === "saturday" || day === "sunday";
        schedule[day] = isWeekend
          ? { ...WEEKEND_DEFAULT, enabled: true }
          : { ...DEFAULT_SETTINGS };
      }
    }
  }

  // Days not mentioned stay at defaults (already set by defaultSchedule)
  return schedule;
}
