// Extract the dialed (called) PSTN number from OpenAI realtime.call.incoming
// sip_headers. Pure. Returns E.164 (e.g. "+13254132487") or null.
//
// CONFIRMED EMPIRICALLY (2026-06-02, real Twilio→OpenAI SIP call): with the
// OpenAI Realtime SIP setup, the `To` header is the OpenAI PROJECT URI
// (`<sip:proj_xxx@sip.api.openai.com;transport=tls>`) — NOT the dialed number.
// Twilio's Elastic SIP Trunk forwards the originally-dialed DID in the
// `Diversion` header (`<sip:+13254132487@twilio.com>;reason=unconditional`).
// The caller's own number is in From / P-Asserted-Identity / Contact, which we
// deliberately do NOT read for dialed-number resolution (we want the called
// number, not the caller) — but extractCallerNumber() below reads those for the
// post-call SMS META loop.
//
// So we prefer `Diversion`, then fall back to `To` / request-URI / X-Original-To
// for other SIP topologies — skipping any value that points at the OpenAI
// endpoint (it can never be the dialed PSTN number).
const DIALED_HEADER_NAMES = ["diversion", "to", "request-uri", "x-original-to"];

// A header value pointing at the OpenAI realtime endpoint is the session
// target, never the dialed number — never extract a number from it.
const OPENAI_SIP_HOST = "sip.api.openai.com";

export function extractDialedNumber(
  sipHeaders: ReadonlyArray<{ name?: string; value?: string }> | undefined | null,
): string | null {
  if (!sipHeaders) return null;
  for (const wanted of DIALED_HEADER_NAMES) {
    const header = sipHeaders.find((h) => (h.name ?? "").trim().toLowerCase() === wanted);
    if (!header?.value) continue;
    if (header.value.includes(OPENAI_SIP_HOST)) continue;
    const num = parseUserPart(header.value);
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

/**
 * Extract the CALLER'S phone number from SIP headers for post-call SMS.
 * Pure. Returns E.164 (e.g. "+16505551234") or null.
 *
 * Prefers `P-Asserted-Identity` (set by the carrier, harder to spoof) then
 * `From`. Returns null for anonymous callers ("anonymous", empty user part, or
 * no valid E.164 extracted). Does NOT read the OpenAI-endpoint `To` header —
 * that's the called URI, not the caller.
 */
// The header names to check for the caller's own number, in preference order.
const CALLER_HEADER_NAMES = ["p-asserted-identity", "from", "contact"];

export function extractCallerNumber(
  sipHeaders: ReadonlyArray<{ name?: string; value?: string }> | undefined | null,
): string | null {
  if (!sipHeaders) return null;
  for (const wanted of CALLER_HEADER_NAMES) {
    const header = sipHeaders.find((h) => (h.name ?? "").trim().toLowerCase() === wanted);
    if (!header?.value) continue;
    // Skip anonymous callers (carrier sends "anonymous" or "Anonymous").
    if (/\banonymous\b/i.test(header.value)) continue;
    // Skip anything pointing at the OpenAI SIP endpoint (never a caller number).
    if (header.value.includes(OPENAI_SIP_HOST)) continue;
    const num = parseUserPart(header.value);
    if (num) return num;
  }
  return null;
}
