// Extract the dialed (called) PSTN number from OpenAI realtime.call.incoming
// sip_headers. Pure. Returns E.164 (e.g. "+18335551234") or null.
//
// The dialed number is the user part of the SIP/tel URI in the header naming
// the called party. Twilio's Elastic SIP Trunk forwards it as the To header.
// We also accept request-URI / Diversion as fallbacks so an upstream header
// rename degrades gracefully (caller falls back to env), not a crash.
const DIALED_HEADER_NAMES = ["to", "diversion", "request-uri", "x-original-to"];

export function extractDialedNumber(
  sipHeaders: ReadonlyArray<{ name?: string; value?: string }> | undefined | null,
): string | null {
  if (!sipHeaders) return null;
  for (const wanted of DIALED_HEADER_NAMES) {
    const header = sipHeaders.find((h) => (h.name ?? "").trim().toLowerCase() === wanted);
    const num = header ? parseUserPart(header.value) : null;
    if (num) return num;
  }
  return null;
}

function parseUserPart(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/[+]?\d[\d\-\s().]{6,}/);
  if (!match) return null;
  const digits = match[0].replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+") ? digits : `+${digits}`;
  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
}
