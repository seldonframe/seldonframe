// ============================================================================
// v1.10.1 — upload_workspace_image accepts image_url
// ============================================================================
//
// Pure helpers covered:
//   - validateImageSourceUrl (https-only, SSRF guards on private/loopback IPs)
//   - deriveContentTypeFromUrl (maps URL extension → MIME, fallback null)
//   - deriveFileNameFromUrl (URL path basename, sanitized)
//
// Why these exist: v1.10.0 upload_workspace_image required the agent to
// base64-encode bytes into a JSON tool argument, which forced multiple
// resize iterations to fit the agent's tool-input token budget. v1.10.1
// adds image_url so the server fetches bytes directly — no base64,
// no agent-side resize iteration. These pure helpers are the SSRF
// guards + URL parsing logic that live outside the fetch-and-stream
// path (which is integration-test territory).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateImageSourceUrl,
  deriveContentTypeFromUrl,
  deriveFileNameFromUrl,
} from "@/lib/page-blocks/images";

// ─── validateImageSourceUrl ────────────────────────────────────────────────

test("validateImageSourceUrl accepts a typical HTTPS URL with image extension", () => {
  const r = validateImageSourceUrl("https://res.cloudinary.com/dhjsbg2cm/image/upload/v1757590893/logo.png");
  assert.equal(r.ok, true);
});

test("validateImageSourceUrl accepts HTTPS URL without an extension (server reads Content-Type)", () => {
  const r = validateImageSourceUrl("https://images.unsplash.com/photo-1234567890");
  assert.equal(r.ok, true);
});

test("validateImageSourceUrl rejects http:// (must be HTTPS)", () => {
  const r = validateImageSourceUrl("http://example.com/logo.png");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => /https/i.test(e)));
});

test("validateImageSourceUrl rejects file:// scheme", () => {
  const r = validateImageSourceUrl("file:///etc/passwd");
  assert.equal(r.ok, false);
});

test("validateImageSourceUrl rejects data: URLs", () => {
  const r = validateImageSourceUrl("data:image/png;base64,iVBORw0KGgo=");
  assert.equal(r.ok, false);
});

test("validateImageSourceUrl rejects ftp:// scheme", () => {
  const r = validateImageSourceUrl("ftp://example.com/logo.png");
  assert.equal(r.ok, false);
});

test("validateImageSourceUrl rejects malformed URLs", () => {
  const r = validateImageSourceUrl("not a url at all");
  assert.equal(r.ok, false);
});

test("validateImageSourceUrl rejects localhost variants (SSRF)", () => {
  for (const host of ["localhost", "127.0.0.1", "127.0.0.42", "[::1]"]) {
    const r = validateImageSourceUrl(`https://${host}/logo.png`);
    assert.equal(r.ok, false, `expected ${host} to be rejected`);
    if (r.ok) continue;
    assert.ok(r.errors.some((e) => /loopback|local|private/i.test(e)));
  }
});

test("validateImageSourceUrl rejects RFC1918 private IPv4 literals (SSRF)", () => {
  for (const host of ["10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1", "192.168.255.255"]) {
    const r = validateImageSourceUrl(`https://${host}/logo.png`);
    assert.equal(r.ok, false, `expected ${host} to be rejected`);
  }
});

test("validateImageSourceUrl rejects link-local 169.254.x.x (cloud metadata SSRF — AWS/GCP)", () => {
  // The AWS metadata service lives at 169.254.169.254 — a classic SSRF
  // exfil target. Must be rejected unconditionally.
  const r = validateImageSourceUrl("https://169.254.169.254/latest/meta-data/");
  assert.equal(r.ok, false);
});

test("validateImageSourceUrl accepts public IPv4 literals", () => {
  // Cloudflare DNS — clearly public; should be allowed.
  const r = validateImageSourceUrl("https://1.1.1.1/some-image");
  assert.equal(r.ok, true);
});

test("validateImageSourceUrl rejects 172.x ranges OUTSIDE 16-31 are OK", () => {
  // 172.32.0.1 is public; 172.31.255.255 is private. Boundary check.
  const inside = validateImageSourceUrl("https://172.16.0.1/x");
  assert.equal(inside.ok, false);
  const outside = validateImageSourceUrl("https://172.32.0.1/x");
  assert.equal(outside.ok, true);
});

// ─── deriveContentTypeFromUrl ──────────────────────────────────────────────

test("deriveContentTypeFromUrl maps common image extensions", () => {
  assert.equal(deriveContentTypeFromUrl("https://x.com/logo.png"), "image/png");
  assert.equal(deriveContentTypeFromUrl("https://x.com/logo.PNG"), "image/png");
  assert.equal(deriveContentTypeFromUrl("https://x.com/photo.jpg"), "image/jpeg");
  assert.equal(deriveContentTypeFromUrl("https://x.com/photo.jpeg"), "image/jpeg");
  assert.equal(deriveContentTypeFromUrl("https://x.com/animated.gif"), "image/gif");
  assert.equal(deriveContentTypeFromUrl("https://x.com/modern.webp"), "image/webp");
  assert.equal(deriveContentTypeFromUrl("https://x.com/icon.svg"), "image/svg+xml");
});

test("deriveContentTypeFromUrl returns null for URLs without recognized extension", () => {
  // The server falls back to the response's Content-Type header in
  // this case; the helper returns null to signal "you decide."
  assert.equal(deriveContentTypeFromUrl("https://images.unsplash.com/photo-12345"), null);
  assert.equal(deriveContentTypeFromUrl("https://x.com/no-ext"), null);
});

test("deriveContentTypeFromUrl strips query strings before reading extension", () => {
  // Cloudinary, Unsplash etc. tack ?w=400&q=80 onto image URLs.
  assert.equal(
    deriveContentTypeFromUrl("https://res.cloudinary.com/x/logo.png?w=400&q=80"),
    "image/png",
  );
});

// ─── deriveFileNameFromUrl ─────────────────────────────────────────────────

test("deriveFileNameFromUrl returns the URL path basename", () => {
  assert.equal(
    deriveFileNameFromUrl("https://res.cloudinary.com/x/logo.png"),
    "logo.png",
  );
  assert.equal(
    deriveFileNameFromUrl("https://x.com/path/to/some-file.jpg"),
    "some-file.jpg",
  );
});

test("deriveFileNameFromUrl strips query string", () => {
  assert.equal(
    deriveFileNameFromUrl("https://x.com/logo.png?v=2&w=400"),
    "logo.png",
  );
});

test("deriveFileNameFromUrl returns 'image' when path has no basename", () => {
  // Defaults so callers can always rely on a non-empty string.
  assert.equal(deriveFileNameFromUrl("https://x.com/"), "image");
  assert.equal(deriveFileNameFromUrl("https://x.com"), "image");
});
