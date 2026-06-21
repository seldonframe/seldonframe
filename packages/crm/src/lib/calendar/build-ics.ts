// 2026-06-21 — Pure RFC-5545 calendar-invite builder.
//
// Produces the `.ics` text emailed as a calendar invite when a booking is
// created (or cancelled). The output is an iTIP message (METHOD:REQUEST for
// new bookings, METHOD:CANCEL for cancellations) that Gmail / Outlook /
// Apple Calendar recognise and offer to add to the recipient's calendar —
// the zero-OAuth "it's in my calendar" win.
//
// Pure + deterministic: no Date.now(), no I/O. The DTSTAMP clock is INJECTED
// via `now` so unit tests assert an exact byte sequence. Keep it that way —
// the side-effecting send lives in lib/calendar/booking-invite.ts.
//
// Compliance notes (RFC 5545):
//   - Line endings are CRLF.
//   - Content lines longer than 75 octets are folded: split into ≤75-octet
//     chunks with each continuation line beginning with a single space.
//   - TEXT values escape backslash, semicolon, comma, and newline.

export type BookingICSMethod = "REQUEST" | "CANCEL";

export type BookingICSInput = {
  /** Stable per-booking UID, e.g. `booking-<id>@seldonframe.com`. The same
   *  UID across REQUEST/CANCEL lets clients correlate the update. */
  uid: string;
  start: Date;
  end: Date;
  /** DTSTAMP source — injected so the builder stays pure/testable. */
  now: Date;
  summary: string;
  description?: string;
  location?: string;
  organizerName: string;
  organizerEmail: string;
  attendeeName?: string;
  attendeeEmail?: string;
  /** Defaults to "REQUEST". "CANCEL" emits STATUS:CANCELLED. */
  method?: BookingICSMethod;
  /** iTIP sequence. Bump on each update (reschedule/cancel). Defaults 0. */
  sequence?: number;
};

/** Zero-pad a number to two digits. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a Date as a UTC iCalendar date-time: `YYYYMMDDTHHMMSSZ`.
 * Uses UTC getters so the output is timezone-independent (the `Z` suffix
 * marks it as UTC, which every calendar client converts to local on display).
 */
export function formatUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const mi = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  return `${y}${mo}${day}T${h}${mi}${s}Z`;
}

/**
 * Escape a TEXT value per RFC 5545 §3.3.11. Order matters: backslash first
 * so we don't double-escape the escapes we add. Strip bare CR; turn LF into
 * the literal `\n` escape.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n");
}

/**
 * Fold a single logical content line to ≤75 octets per physical line
 * (RFC 5545 §3.1). Continuation lines start with one space. We measure in
 * UTF-8 octets (not JS chars) and only break on octet boundaries that don't
 * split a multi-byte sequence, so non-ASCII text (em dash, accents) folds
 * safely. Physical lines are joined with CRLF.
 */
export function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  // First physical line: up to 75 octets. Subsequent lines: a leading space
  // counts toward the 75, so they carry up to 74 octets of payload.
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multi-byte UTF-8 sequence: continuation bytes match
    // 0b10xxxxxx. Walk back until `end` lands on a lead byte boundary.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    const chunk = bytes.subarray(start, end).toString("utf8");
    out.push(out.length === 0 ? chunk : ` ${chunk}`);
    start = end;
    limit = 74;
  }
  return out.join("\r\n");
}

/**
 * Build the RFC-5545 calendar invite text for a booking.
 *
 * @returns the full VCALENDAR document (CRLF line endings, trailing CRLF).
 */
export function buildBookingICS(input: BookingICSInput): string {
  const method: BookingICSMethod = input.method ?? "REQUEST";
  const sequence = input.sequence ?? 0;
  const status = method === "CANCEL" ? "CANCELLED" : "CONFIRMED";

  // Assemble the logical lines in spec order. Each gets folded individually.
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SeldonFrame//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${formatUTC(input.now)}`,
    `DTSTART:${formatUTC(input.start)}`,
    `DTEND:${formatUTC(input.end)}`,
    `SUMMARY:${escapeText(input.summary)}`,
  ];

  if (input.description && input.description.trim()) {
    lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  }
  if (input.location && input.location.trim()) {
    lines.push(`LOCATION:${escapeText(input.location)}`);
  }

  // ORGANIZER — CN is a param value; escapeText would over-escape the comma
  // rules, so we only strip characters that would break the line structure.
  lines.push(
    `ORGANIZER;CN=${sanitizeParam(input.organizerName)}:mailto:${input.organizerEmail}`,
  );

  if (input.attendeeEmail && input.attendeeEmail.trim()) {
    const cn = sanitizeParam(input.attendeeName ?? input.attendeeEmail);
    lines.push(
      `ATTENDEE;CN=${cn};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    );
  }

  lines.push(`SEQUENCE:${sequence}`);
  lines.push(`STATUS:${status}`);
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * Sanitise a parameter value (e.g. CN) for inclusion in a property
 * parameter. RFC 5545 forbids the structural characters `"`, `;`, `,`, `:`
 * and control chars in an unquoted param value; we strip them rather than
 * quote so the CN stays human-readable and the line stays simple.
 */
function sanitizeParam(value: string): string {
  return value.replace(/[";,:\r\n]/g, " ").replace(/\s+/g, " ").trim();
}
