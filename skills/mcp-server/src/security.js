// v1.59.2 — security hardening helpers shared by tools.js.
//
// Two independent concerns live here:
//   1. sniffImageKind — magic-byte detection so upload_workspace_image only
//      ever forwards bytes that are actually image files (not arbitrary
//      local files an agent was pointed at).
//   2. assertPublicHttpUrl — an SSRF guard for machine-side fetches of
//      operator-supplied URLs (fetch_source_for_soul today). Rejects
//      loopback / private / link-local targets so the MCP process can't be
//      used to probe the operator's own LAN or cloud metadata endpoints.
//
// Both are pure-ish (assertPublicHttpUrl takes an injectable `lookup` for
// tests) and have zero dependency on the rest of tools.js so they can be
// unit-tested in isolation (see tests/security.test.mjs).

const MAX_SVG_BYTES = 1 * 1024 * 1024; // 1MB

// Loose but sufficient: optional UTF-8 BOM, optional XML prolog, optional
// DOCTYPE, then an <svg ...> or <svg> root tag. Case-insensitive.
const SVG_PATTERN =
  /^﻿?\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i;

/**
 * Sniff the image kind of a buffer from its magic bytes. Returns one of
 * "png" | "jpeg" | "gif" | "webp" | "svg", or null if the buffer doesn't
 * look like a recognized image format.
 *
 * @param {Buffer} buffer
 * @returns {"png"|"jpeg"|"gif"|"webp"|"svg"|null}
 */
export function sniffImageKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  // PNG: 89 50 4E 47 (plus the usual 0D 0A 1A 0A trailer, but the first
  // four bytes are sufficient to identify it unambiguously).
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }

  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpeg";
  }

  // GIF: ASCII "GIF8" (covers both GIF87a and GIF89a).
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "GIF8") {
    return "gif";
  }

  // WebP: "RIFF" at offset 0, "WEBP" at offset 8.
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  // SVG: text-based, so magic bytes don't apply — sniff the text instead.
  // Bound the size before decoding so a huge non-image file doesn't get
  // fully UTF-8-decoded just to fail this check.
  if (buffer.length <= MAX_SVG_BYTES) {
    const text = buffer.toString("utf8");
    if (SVG_PATTERN.test(text)) return "svg";
  }

  return null;
}

// ── SSRF guard ──────────────────────────────────────────────────────────

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost") return true;
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Parse an IPv4 dotted-quad string into four octet numbers, or null if it
 * isn't a valid literal IPv4 address.
 * @param {string} host
 * @returns {[number,number,number,number]|null}
 */
function parseIPv4(host) {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/**
 * Is this IPv4 (as an octet quad) inside a non-public range?
 * @param {[number,number,number,number]} o
 */
function isNonPublicIPv4(o) {
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254/16 (link-local)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 (CGNAT)
  return false;
}

/**
 * Is this literal address (v4 or v6 string form) non-public? Handles
 * IPv4-mapped IPv6 (::ffff:x.x.x.x) by unwrapping to the embedded IPv4.
 * @param {string} address
 */
function isNonPublicIpLiteral(address) {
  const addr = address.toLowerCase();

  // IPv4-mapped IPv6: ::ffff:x.x.x.x (or the rarer ::ffff:0:x.x.x.x form).
  const mappedMatch = addr.match(/^::ffff:(?:0:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedMatch) {
    const v4 = parseIPv4(mappedMatch[1]);
    return v4 ? isNonPublicIPv4(v4) : true; // malformed embedded v4 = reject
  }

  const v4 = parseIPv4(addr);
  if (v4) return isNonPublicIPv4(v4);

  // IPv6 literal checks.
  if (addr === "::1") return true; // loopback
  if (addr === "::") return true; // unspecified
  if (/^fc[0-9a-f]{2}:/.test(addr) || /^fd[0-9a-f]{2}:/.test(addr)) {
    return true; // fc00::/7 (unique local) — first byte 0xfc or 0xfd
  }
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true; // fe80::/10 (link-local)

  // Not a recognized literal at all (shouldn't happen given callers only
  // pass here after confirming it parses as an IP) — fail closed.
  return false;
}

/**
 * Does this string parse as a literal IP address (v4 or v6)? Deliberately
 * simple — good enough to distinguish "the caller already resolved this to
 * an IP" from "this is a hostname that still needs DNS resolution."
 * @param {string} host
 */
function isIpLiteral(host) {
  if (parseIPv4(host)) return true;
  // Very small heuristic for IPv6 literal form: contains a colon and only
  // hex digits / colons (optionally with an embedded dotted-quad tail for
  // the IPv4-mapped form).
  return /^[0-9a-f:]+(:\d{1,3}(?:\.\d{1,3}){3})?$/i.test(host) && host.includes(":");
}

/**
 * Assert that a URL is safe for the MCP server (running on the operator's
 * machine) to fetch directly: http(s) only, and resolves exclusively to
 * public IP addresses. Throws with a clear message otherwise.
 *
 * Guards against SSRF-style abuse where an operator-supplied "scrape this
 * URL" argument actually points at localhost, a LAN device, or a cloud
 * metadata endpoint (169.254.169.254) reachable from wherever the MCP
 * process happens to run.
 *
 * @param {string} urlString
 * @param {{ lookup?: (hostname: string, opts: { all: true }) => Promise<{address:string,family:number}[]> }} [opts]
 */
export async function assertPublicHttpUrl(urlString, opts = {}) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`assertPublicHttpUrl: "${urlString}" is not a valid URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `assertPublicHttpUrl: protocol "${parsed.protocol}" is not allowed for "${urlString}" — only http: and https: are permitted.`,
    );
  }

  // URL.hostname strips brackets from IPv6 literals (e.g. "[::1]" -> "::1").
  const hostname = parsed.hostname;

  if (isBlockedHostname(hostname)) {
    throw new Error(
      `assertPublicHttpUrl: hostname "${hostname}" is blocked (localhost / .localhost / .local / .internal).`,
    );
  }

  if (isIpLiteral(hostname)) {
    if (isNonPublicIpLiteral(hostname)) {
      throw new Error(
        `assertPublicHttpUrl: "${hostname}" is not a public IP address.`,
      );
    }
    return;
  }

  const lookup =
    opts.lookup ?? (await import("node:dns/promises")).lookup;
  let records;
  try {
    records = await lookup(hostname, { all: true });
  } catch (err) {
    throw new Error(
      `assertPublicHttpUrl: DNS lookup for "${hostname}" failed — ${err?.message ?? err}`,
    );
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(
      `assertPublicHttpUrl: DNS lookup for "${hostname}" returned no addresses.`,
    );
  }

  for (const record of records) {
    const address = record?.address ?? record;
    if (typeof address !== "string" || isNonPublicIpLiteral(address)) {
      throw new Error(
        `assertPublicHttpUrl: "${hostname}" resolves to a non-public address (${address}) — refusing to fetch.`,
      );
    }
  }
}
