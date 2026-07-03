// ============================================================================
// SSRF egress guard (shared) — FIX 1 + 2 of the 2026-06-28 security audit.
// ============================================================================
//
// Several routes `fetch()` a URL the *caller* supplies (analyze-url,
// soul-wiki ingest) and reflect the response body back. With only a
// `^https?://` protocol check, an attacker can point the URL at an
// internal address — `http://169.254.169.254/…` (cloud metadata),
// `http://127.0.0.1:6379/` (local Redis/admin), `http://10.x` (VPC
// services) — and read the response. Classic Server-Side Request
// Forgery.
//
// This module is the ONE place that decides "is this URL safe to fetch
// from a server?". It does two things:
//
//   1. Shape check (pure, synchronous): protocol ∈ {http,https}, no
//      embedded credentials, sane port, and the hostname is not a
//      well-known internal name (`localhost`, `metadata.google.internal`,
//      `*.internal`) NOR a literal private IP.
//
//   2. DNS resolution (async): resolve the hostname to ALL its addresses
//      and reject if ANY of them is loopback / private / link-local /
//      unique-local / metadata. A name that resolves to an internal IP
//      is the main exploit; resolving every address closes the
//      "one public + one private A record" trick.
//
// ── DNS-rebinding TOCTOU note ─────────────────────────────────────────
// Resolving here and then calling `fetch(url)` is two separate DNS
// lookups: an attacker who controls the authoritative DNS can answer
// "public IP" for our resolve and "127.0.0.1" for fetch's connect
// (short-TTL rebind). Fully closing that requires PINNING the connect
// socket to the address we vetted (a custom `undici` dispatcher /
// `lookup`). We return the pinned `ip` so a caller CAN do that, but the
// resolve-and-reject below already blocks the overwhelming-majority
// exploit (a name whose records simply point inside). Connect-IP pinning
// is tracked as a hardening follow-up.
//
// The pure helpers (`isBlockedIp`, `isAllowedUrlShape`) have no Node
// dependency so they're unit-testable without DNS. `assertPublicHttpUrl`
// takes a dependency-injected resolver (defaults to `dns.promises.lookup`)
// so tests can simulate any resolution.

/** Thrown when a URL is not safe to fetch server-side. The message is
 *  intentionally generic — callers should NOT echo internal detail back
 *  to the requester (return a flat 400 "URL not allowed"). */
export class SsrfBlockedError extends Error {
  readonly code = "SSRF_BLOCKED";
  constructor(message = "URL not allowed") {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/** A resolved address as returned by `dns.promises.lookup(host, { all: true })`. */
export type ResolvedAddress = { address: string; family: number };

/** Dependency-injectable resolver. Returns every address for the host. */
export type DnsResolver = (host: string) => Promise<ResolvedAddress[]>;

export type AssertOptions = {
  /** Override the DNS resolver (tests inject a fake; prod uses dns.lookup). */
  resolve?: DnsResolver;
};

/** Allowed outbound ports. http/https default + a few common alternates that
 *  legitimate sites use, but NOT arbitrary ports (which would let the guard be
 *  used to probe `host:22`, `host:6379`, etc. on a public box). */
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

/** Hostnames that always mean "internal" regardless of DNS. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

// ── IP classification ─────────────────────────────────────────────────────────

/** Parse a dotted-quad IPv4 string into 4 octets, or null if not IPv4. */
function parseIpv4(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const;
  for (const o of octets) {
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
  }
  return [octets[0], octets[1], octets[2], octets[3]];
}

/** True if the IPv4 address is in a loopback / private / link-local / reserved
 *  range we must never fetch from. */
function isBlockedIpv4(ip: string): boolean {
  const octets = parseIpv4(ip);
  if (!octets) return false;
  const [a, b] = octets;

  // 0.0.0.0/8 — "this host" / unspecified.
  if (a === 0) return true;
  // 10.0.0.0/8 — private.
  if (a === 10) return true;
  // 127.0.0.0/8 — loopback.
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local (includes 169.254.169.254 metadata).
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — private.
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 — private.
  if (a === 192 && b === 168) return true;
  // 192.0.0.0/24 — IETF protocol assignments (incl. 192.0.0.0/29 etc).
  if (a === 192 && b === 0 && octets[2] === 0) return true;
  // 100.64.0.0/10 — carrier-grade NAT / shared address space.
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 255.255.255.255 — broadcast.
  if (a === 255 && b === 255 && octets[2] === 255 && octets[3] === 255) return true;

  return false;
}

/** Expand a (possibly compressed) IPv6 string to 8 hextets, or null. Handles
 *  `::`, leading/trailing `::`, and IPv4-mapped tails (`::ffff:1.2.3.4`). */
function expandIpv6(ip: string): number[] | null {
  let s = ip.trim().toLowerCase();
  if (s.length === 0) return null;
  // Strip a zone id if present (fe80::1%eth0).
  const pct = s.indexOf("%");
  if (pct !== -1) s = s.slice(0, pct);

  // Embedded IPv4 tail → convert to two hextets.
  const v4Match = /(.*:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(s);
  if (v4Match) {
    const v4 = parseIpv4(v4Match[2]);
    if (!v4) return null;
    const hi = (v4[0] << 8) | v4[1];
    const lo = (v4[2] << 8) | v4[3];
    s = `${v4Match[1]}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const parts = s.split("::");
  if (parts.length > 2) return null;

  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];

  const toNums = (arr: string[]): number[] | null => {
    const out: number[] = [];
    for (const h of arr) {
      if (h === "") return null;
      if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
      out.push(parseInt(h, 16));
    }
    return out;
  };

  const headNums = toNums(head);
  const tailNums = toNums(tail);
  if (headNums === null || tailNums === null) return null;

  if (parts.length === 2) {
    const fill = 8 - headNums.length - tailNums.length;
    if (fill < 0) return null;
    return [...headNums, ...Array(fill).fill(0), ...tailNums];
  }

  // No `::` — must be exactly 8 hextets.
  if (headNums.length !== 8) return null;
  return headNums;
}

/** True if the IPv6 address is loopback / unspecified / unique-local /
 *  link-local, OR an IPv4-mapped address whose embedded IPv4 is blocked. */
function isBlockedIpv6(ip: string): boolean {
  const h = expandIpv6(ip);
  if (!h) return false;

  // ::1 loopback.
  if (h.every((x, i) => (i < 7 ? x === 0 : x === 1))) return true;
  // :: unspecified.
  if (h.every((x) => x === 0)) return true;

  // IPv4-mapped ::ffff:0:0/96 — classify by the embedded IPv4.
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) {
    const a = (h[6] >> 8) & 0xff;
    const b = h[6] & 0xff;
    const c = (h[7] >> 8) & 0xff;
    const d = h[7] & 0xff;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }
  // IPv4-compatible ::0:0/96 (deprecated) — classify by embedded IPv4 too.
  if (h.slice(0, 6).every((x) => x === 0) && (h[6] !== 0 || h[7] !== 0)) {
    const a = (h[6] >> 8) & 0xff;
    const b = h[6] & 0xff;
    const c = (h[7] >> 8) & 0xff;
    const d = h[7] & 0xff;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }

  // fc00::/7 — unique-local (fc00.. and fd00..).
  if ((h[0] & 0xfe00) === 0xfc00) return true;
  // fe80::/10 — link-local.
  if ((h[0] & 0xffc0) === 0xfe80) return true;

  return false;
}

/**
 * PURE. True if `ip` (a literal IPv4 or IPv6 string) is in a range we must
 * never let a server fetch from: loopback, private, link-local, unique-local,
 * cloud-metadata (169.254.169.254), or unspecified/broadcast. Unknown / public
 * addresses return false.
 */
export function isBlockedIp(ip: string): boolean {
  if (!ip) return false;
  const trimmed = ip.trim();
  if (trimmed.includes(":")) return isBlockedIpv6(trimmed);
  return isBlockedIpv4(trimmed);
}

// ── URL shape ─────────────────────────────────────────────────────────────────

export type ShapeResult = { ok: true } | { ok: false; reason: string };

/** Strip the brackets a URL keeps around an IPv6 host (`[::1]` → `::1`). */
function unbracketHost(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/**
 * PURE. Validate the *shape* of a parsed URL (no DNS):
 *   - protocol is http: or https:
 *   - no embedded username/password
 *   - port is empty or in the small allow-list
 *   - hostname is not a known-internal name
 *   - if the hostname is a literal IP, it is not a blocked range
 *
 * Returns `{ ok:true }` or `{ ok:false, reason }`. The reason is for logs,
 * never the HTTP response.
 */
export function isAllowedUrlShape(url: URL): ShapeResult {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "protocol" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials" };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return { ok: false, reason: "port" };
  }

  const host = unbracketHost(url.hostname).toLowerCase();
  if (!host) {
    return { ok: false, reason: "empty-host" };
  }
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "blocked-hostname" };
  }
  // Any *.internal name (GCP, k8s, etc.) is internal by convention.
  if (host.endsWith(".internal") || host.endsWith(".local") || host === "internal") {
    return { ok: false, reason: "internal-tld" };
  }
  // Literal IP in the hostname → classify it now (covers the no-DNS case
  // like http://169.254.169.254/ or http://[::1]/).
  if (isBlockedIp(host)) {
    return { ok: false, reason: "literal-private-ip" };
  }

  return { ok: true };
}

// ── DNS-backed assertion ──────────────────────────────────────────────────────

let defaultResolver: DnsResolver | null = null;

/** Lazily build the production resolver from node:dns. Imported lazily so the
 *  pure helpers above stay importable in non-Node contexts. */
async function getDefaultResolver(): Promise<DnsResolver> {
  if (defaultResolver) return defaultResolver;
  const dns = await import("node:dns");
  defaultResolver = async (host: string) => {
    const results = await dns.promises.lookup(host, { all: true });
    return results.map((r) => ({ address: r.address, family: r.family }));
  };
  return defaultResolver;
}

/**
 * Assert that `rawUrl` is safe to fetch from a server. Validates the URL shape,
 * resolves the hostname to ALL addresses, and rejects if ANY resolved address
 * is in a blocked range. Returns the parsed URL and the first (pinned) public
 * address on success.
 *
 * Throws {@link SsrfBlockedError} on any rejection (bad shape, unparseable URL,
 * DNS failure, or a blocked address) — fail-closed. The thrown message is
 * generic; do NOT surface it verbatim to the requester.
 */
export async function assertPublicHttpUrl(
  rawUrl: string,
  opts: AssertOptions = {},
): Promise<{ url: URL; ip: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError();
  }

  const shape = isAllowedUrlShape(url);
  if (!shape.ok) {
    throw new SsrfBlockedError();
  }

  const host = unbracketHost(url.hostname);

  // If the host is already a literal IP, isAllowedUrlShape vetted it — no DNS
  // needed, pin it directly.
  if (parseIpv4(host) || host.includes(":")) {
    return { url, ip: host };
  }

  const resolve = opts.resolve ?? (await getDefaultResolver());

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(host);
  } catch {
    // DNS failure → fail closed.
    throw new SsrfBlockedError();
  }

  if (!addresses || addresses.length === 0) {
    throw new SsrfBlockedError();
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new SsrfBlockedError();
    }
  }

  return { url, ip: addresses[0]!.address };
}

// ── Redirect-safe fetch ────────────────────────────────────────────────────────
//
// `assertPublicHttpUrl` only vets the URL it's given. `fetch()` follows
// redirects by default, so a public page that 302's to
// `http://169.254.169.254/` (or any other internal target) sails straight
// past the guard on the SECOND hop. Three call sites independently vetted
// only the initial URL and then did a normal `fetch` — this helper is the
// one place that closes that gap: it re-runs `assertPublicHttpUrl` on every
// hop, using `redirect: "manual"` so the runtime never auto-follows a
// Location header we haven't vetted ourselves. Mirrors the approach in
// `skills/mcp-server/src/client.js` (`fetchText`), which can't be imported
// here (separate package).

/** Default cap on redirect hops before we give up (matches the MCP client's
 *  MAX_REDIRECTS = 3). */
const DEFAULT_MAX_REDIRECTS = 3;

/**
 * Fetch `url` from the server, re-vetting EVERY redirect hop through
 * {@link assertPublicHttpUrl} before following it. Throws
 * {@link SsrfBlockedError} if the initial URL, any intermediate Location, or
 * the hop count fails the guard. Returns the first non-redirect Response —
 * callers keep their own `.text()` / size-cap / content-type handling.
 *
 * `init` is passed through to every hop's `fetch` call (headers, signal,
 * method, …) except `redirect`, which is always forced to `"manual"` so we
 * can inspect and re-vet each Location ourselves.
 *
 * `opts.resolve` is the same DNS-resolver DI seam as {@link AssertOptions} —
 * threaded through to every hop's `assertPublicHttpUrl` call so tests can
 * simulate resolution without touching the network.
 */
export async function fetchPublicUrlSafe(
  url: string,
  init?: RequestInit,
  opts?: { maxRedirects?: number; resolve?: DnsResolver },
): Promise<Response> {
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const assertOpts: AssertOptions = opts?.resolve ? { resolve: opts.resolve } : {};

  let currentUrl = (await assertPublicHttpUrl(url, assertOpts)).url.toString();
  for (let hop = 0; ; hop++) {
    const response = await fetch(currentUrl, { ...init, redirect: "manual" });
    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) return response;

    if (hop >= maxRedirects) {
      throw new SsrfBlockedError();
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new SsrfBlockedError();
    }
    // Location may be relative — resolve against the URL that produced it,
    // then re-vet the RESOLVED absolute URL before ever following it.
    const nextUrl = new URL(location, currentUrl).toString();
    currentUrl = (await assertPublicHttpUrl(nextUrl, assertOpts)).url.toString();
  }
}
