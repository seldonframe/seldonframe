// Minimal POSIX 5-field cron utility for SLICE 5 scheduled triggers.
//
// Scope: validate 5-field POSIX cron expressions + compute next fire
// time respecting an IANA timezone. No shorthand support (@daily etc.),
// no named days (sun/mon/...), no L/W/#/? operators. V1 is intentionally
// minimal — the common-case surface needed by SLICE 5 archetypes.
//
// Why inline instead of the croner dependency: this worktree's pnpm
// virtual store can't accept new deps without full reinstall (same
// constraint that produced the AST-event-union inline pattern in
// SLICE 2). 150 LOC of pure logic beats adding a ~8KB dep when the
// needed surface is 3 functions.
//
// Shipped in SLICE 5 PR 1 C2 per audit §3.3.

// ---------------------------------------------------------------------
// Per-field matching
// ---------------------------------------------------------------------

export type CronField = {
  /** Does the given value match this parsed field? */
  matches: (value: number) => boolean;
};

/**
 * Parse a single cron field (one of minute/hour/dom/month/dow).
 * Returns null for malformed input. Supports:
 *   "*"       — any value in [min, max]
 *   N         — exact integer
 *   N-M       — inclusive range (N <= M)
 *   N,M,...   — comma-list of any of the above shapes
 *   BASE / N  — step form; BASE is "*" or a range, step is a positive int
 */
export function parseCronField(raw: string, min: number, max: number): CronField | null {
  if (!raw || typeof raw !== "string") return null;

  const parts = raw.split(",");
  const matchers: Array<(v: number) => boolean> = [];

  for (const part of parts) {
    const matcher = parsePart(part, min, max);
    if (!matcher) return null;
    matchers.push(matcher);
  }

  return { matches: (v) => matchers.some((m) => m(v)) };
}

function parsePart(part: string, min: number, max: number): ((v: number) => boolean) | null {
  // Step form first: "X/N" where X is "*" or "A-B" or "A"
  const stepMatch = part.match(/^([^/]+)\/(\d+)$/);
  if (stepMatch) {
    const [, base, stepStr] = stepMatch;
    const step = Number(stepStr);
    if (!Number.isInteger(step) || step <= 0) return null;
    let rangeMin = min;
    let rangeMax = max;
    if (base !== "*") {
      const rangeMatch = base.match(/^(\d+)(?:-(\d+))?$/);
      if (!rangeMatch) return null;
      const a = Number(rangeMatch[1]);
      const b = rangeMatch[2] !== undefined ? Number(rangeMatch[2]) : max;
      if (!inBounds(a, min, max) || !inBounds(b, min, max) || a > b) return null;
      rangeMin = a;
      rangeMax = b;
    }
    return (v: number) => v >= rangeMin && v <= rangeMax && (v - rangeMin) % step === 0;
  }

  if (part === "*") {
    return (v: number) => v >= min && v <= max;
  }

  const rangeMatch = part.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (!inBounds(a, min, max) || !inBounds(b, min, max) || a > b) return null;
    return (v: number) => v >= a && v <= b;
  }

  const singleMatch = part.match(/^(\d+)$/);
  if (singleMatch) {
    const n = Number(singleMatch[1]);
    if (!inBounds(n, min, max)) return null;
    return (v: number) => v === n;
  }

  return null;
}

function inBounds(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

// ---------------------------------------------------------------------
// Full-expression validation
// ---------------------------------------------------------------------

type ParsedCron = {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
};

function parseCronExpression(expr: string): ParsedCron | null {
  if (typeof expr !== "string") return null;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const minute = parseCronField(fields[0], 0, 59);
  const hour = parseCronField(fields[1], 0, 23);
  const dom = parseCronField(fields[2], 1, 31);
  const month = parseCronField(fields[3], 1, 12);
  const dow = parseCronField(fields[4], 0, 6);

  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow };
}

export function isValidCronExpression(expr: string): boolean {
  return parseCronExpression(expr) !== null;
}

// ---------------------------------------------------------------------
// IANA timezone validation
// ---------------------------------------------------------------------

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    // Intl.DateTimeFormat throws RangeError on unknown timeZone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Next-fire computation
// ---------------------------------------------------------------------

/**
 * Given a cron expression, an IANA timezone, and a reference time,
 * return the next instant (in UTC) when the expression matches.
 *
 * Implementation: advance the reference time by 1-minute steps,
 * converting each step to the target timezone's wall-clock, and
 * test all 5 cron fields. First match wins. Caps at 4 years of
 * look-ahead as a safety bound (invalid expressions like "0 0 30 2 *"
 * that never fire wouldn't otherwise terminate).
 */
export function computeNextFireAt(expr: string, tz: string, after: Date): Date {
  const parsed = parseCronExpression(expr);
  if (!parsed) throw new Error(`invalid cron expression: ${JSON.stringify(expr)}`);
  if (!isValidIanaTimezone(tz)) throw new Error(`invalid IANA timezone: ${JSON.stringify(tz)}`);

  // Start at the NEXT whole minute after `after`. Fires at the reference
  // minute itself if the reference is exactly a minute boundary and we
  // want to honor it — but "after" semantics mean strictly greater.
  const start = new Date(after);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  // Safety bound: 4 years of minute-ticks = ~2.1M iterations.
  // Real schedules fire within minutes to weeks; 4 years is a
  // degenerate upper bound.
  const MAX_ITER = 4 * 366 * 24 * 60;

  for (let i = 0; i < MAX_ITER; i += 1) {
    if (matchesAtUtc(parsed, tz, start)) return new Date(start);
    start.setUTCMinutes(start.getUTCMinutes() + 1);
  }

  throw new Error(`cron expression ${JSON.stringify(expr)} does not fire within 4 years of reference`);
}

function matchesAtUtc(parsed: ParsedCron, tz: string, candidate: Date): boolean {
  // Project candidate UTC instant onto the tz wall clock via
  // Intl.DateTimeFormat.formatToParts (language-neutral, stable).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(candidate);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minute = Number(get("minute"));
  // hour12:false still emits "24" at midnight on some locales; normalize.
  const hour = Number(get("hour")) % 24;
  const dom = Number(get("day"));
  const month = Number(get("month"));
  const dow = weekdayShortToIndex(get("weekday"));

  return (
    parsed.minute.matches(minute) &&
    parsed.hour.matches(hour) &&
    parsed.dom.matches(dom) &&
    parsed.month.matches(month) &&
    parsed.dow.matches(dow)
  );
}

function weekdayShortToIndex(short: string): number {
  switch (short) {
    case "Sun": return 0;
    case "Mon": return 1;
    case "Tue": return 2;
    case "Wed": return 3;
    case "Thu": return 4;
    case "Fri": return 5;
    case "Sat": return 6;
    default: return -1; // won't match any cron dow field
  }
}
