import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffImageKind, assertPublicHttpUrl } from "../src/security.js";

// ── sniffImageKind ────────────────────────────────────────────────────

test("sniffImageKind: detects png from magic bytes", () => {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(sniffImageKind(buf), "png");
});

test("sniffImageKind: detects jpeg from magic bytes", () => {
  const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.equal(sniffImageKind(buf), "jpeg");
});

test("sniffImageKind: detects gif from magic bytes", () => {
  const buf = Buffer.from("GIF89a" + "\x00".repeat(10));
  assert.equal(sniffImageKind(buf), "gif");
});

test("sniffImageKind: detects gif87a variant too", () => {
  const buf = Buffer.from("GIF87a" + "\x00".repeat(10));
  assert.equal(sniffImageKind(buf), "gif");
});

test("sniffImageKind: detects webp from RIFF/WEBP markers", () => {
  const buf = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // file size (unused by sniff)
    Buffer.from("WEBP", "ascii"),
    Buffer.from([0x00, 0x00]),
  ]);
  assert.equal(sniffImageKind(buf), "webp");
});

test("sniffImageKind: accepts a plain svg document", () => {
  const buf = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    "utf8",
  );
  assert.equal(sniffImageKind(buf), "svg");
});

test("sniffImageKind: accepts svg with xml prolog and doctype", () => {
  const buf = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
      '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    "utf8",
  );
  assert.equal(sniffImageKind(buf), "svg");
});

test("sniffImageKind: rejects a .env-style plaintext buffer", () => {
  const buf = Buffer.from(
    "ANTHROPIC_API_KEY=sk-ant-abc123\nOPENAI_API_KEY=sk-proj-xyz\n",
    "utf8",
  );
  assert.equal(sniffImageKind(buf), null);
});

test("sniffImageKind: rejects an oversized svg (>1MB) even if well-formed", () => {
  const padding = "<!-- " + "x".repeat(1024 * 1024) + " -->";
  const buf = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg">${padding}</svg>`,
    "utf8",
  );
  assert.ok(buf.length > 1024 * 1024);
  assert.equal(sniffImageKind(buf), null);
});

test("sniffImageKind: rejects an empty buffer", () => {
  assert.equal(sniffImageKind(Buffer.alloc(0)), null);
});

test("sniffImageKind: rejects unrelated binary data", () => {
  const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
  assert.equal(sniffImageKind(buf), null);
});

// ── assertPublicHttpUrl ─────────────────────────────────────────────────

function lookupReturning(...addresses) {
  return async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
}

test("assertPublicHttpUrl: accepts https://example.com with an injected public-IP lookup", async () => {
  await assert.doesNotReject(() =>
    assertPublicHttpUrl("https://example.com", {
      lookup: lookupReturning("93.184.216.34"),
    }),
  );
});

test("assertPublicHttpUrl: accepts a literal public IPv4 URL with no DNS lookup needed", async () => {
  await assert.doesNotReject(() =>
    assertPublicHttpUrl("http://93.184.216.34", {
      lookup: () => {
        throw new Error("lookup should not be called for an IP literal");
      },
    }),
  );
});

test("assertPublicHttpUrl: rejects non-http(s) protocols", async () => {
  await assert.rejects(() => assertPublicHttpUrl("ftp://example.com"));
});

test("assertPublicHttpUrl: rejects localhost", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://localhost/"));
});

test("assertPublicHttpUrl: rejects 127.0.0.1 (loopback)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/"));
});

test("assertPublicHttpUrl: rejects 10.0.0.5 (private /8)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://10.0.0.5/"));
});

test("assertPublicHttpUrl: rejects 172.20.1.1 (private /12)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://172.20.1.1/"));
});

test("assertPublicHttpUrl: rejects 192.168.1.1 (private /16)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://192.168.1.1/"));
});

test("assertPublicHttpUrl: rejects 169.254.1.1 (link-local)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://169.254.1.1/"));
});

test("assertPublicHttpUrl: rejects ::1 (IPv6 loopback)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://[::1]/"));
});

test("assertPublicHttpUrl: rejects fc00::1 (unique local IPv6)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://[fc00::1]/"));
});

test("assertPublicHttpUrl: rejects ::ffff:10.0.0.1 (IPv4-mapped private address)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://[::ffff:10.0.0.1]/"));
});

test("assertPublicHttpUrl: rejects a hostname whose injected lookup resolves to a private IP", async () => {
  await assert.rejects(() =>
    assertPublicHttpUrl("https://sneaky.example.com", {
      lookup: lookupReturning("192.168.0.10"),
    }),
  );
});

test("assertPublicHttpUrl: rejects a hostname whose lookup returns an empty result", async () => {
  await assert.rejects(() =>
    assertPublicHttpUrl("https://nowhere.example.com", {
      lookup: async () => [],
    }),
  );
});

// ── assertLocalPathAllowed (v1.61.0) ────────────────────────────────────

import path from "node:path";
import { assertLocalPathAllowed, getAllowedUploadRoots } from "../src/security.js";

// Identity realpath fake: resolves nothing, pretends every path exists.
// Symlink-specific tests inject a mapping instead.
const identityRealpath = (p) => p;

const CWD = path.resolve(path.sep, "proj");
const opts = (extra = {}) => ({
  cwd: CWD,
  env: {},
  realpath: identityRealpath,
  caseInsensitive: false,
  ...extra,
});

test("assertLocalPathAllowed: accepts an absolute path under cwd", () => {
  const file = path.join(CWD, "images", "logo.png");
  assert.equal(assertLocalPathAllowed(file, opts()), file);
});

test("assertLocalPathAllowed: resolves a relative path against cwd and accepts it", () => {
  const rel = path.join("images", "logo.png");
  assert.equal(assertLocalPathAllowed(rel, opts()), path.join(CWD, rel));
});

test("assertLocalPathAllowed: rejects an absolute path outside cwd", () => {
  const outside = path.resolve(path.sep, "secrets", "photo.png");
  assert.throws(
    () => assertLocalPathAllowed(outside, opts()),
    /outside the allowed upload directories/,
  );
});

test("assertLocalPathAllowed: rejects ../ traversal escaping cwd", () => {
  assert.throws(
    () => assertLocalPathAllowed(path.join("..", "escape.png"), opts()),
    /outside the allowed upload directories/,
  );
});

test("assertLocalPathAllowed: allows an extra root opted in via SELDONFRAME_UPLOAD_ROOTS", () => {
  const extraRoot = path.resolve(path.sep, "assets");
  const file = path.join(extraRoot, "hero.jpg");
  assert.equal(
    assertLocalPathAllowed(
      file,
      opts({ env: { SELDONFRAME_UPLOAD_ROOTS: extraRoot } }),
    ),
    file,
  );
});

test("assertLocalPathAllowed: rejects a symlink inside cwd that resolves outside it", () => {
  const link = path.join(CWD, "innocent-link.png");
  const target = path.resolve(path.sep, "home", "user", ".ssh", "id_rsa");
  const realpath = (p) => (p === link ? target : p);
  assert.throws(
    () => assertLocalPathAllowed(link, opts({ realpath })),
    /outside the allowed upload directories/,
  );
});

test("assertLocalPathAllowed: case-insensitive containment when enabled (win32 behavior)", () => {
  const file = path.join(path.resolve(path.sep, "PROJ"), "logo.png");
  assert.equal(
    assertLocalPathAllowed(file, opts({ caseInsensitive: true })),
    file,
  );
});

test("assertLocalPathAllowed: surfaces a clear error when the file doesn't exist", () => {
  const realpath = () => {
    const err = new Error("ENOENT: no such file or directory");
    throw err;
  };
  assert.throws(
    () => assertLocalPathAllowed(path.join(CWD, "missing.png"), opts({ realpath })),
    /cannot resolve/,
  );
});

test("getAllowedUploadRoots: cwd only by default, plus delimiter-split env roots", () => {
  assert.deepEqual(getAllowedUploadRoots({}, CWD), [CWD]);
  const a = path.resolve(path.sep, "a");
  const b = path.resolve(path.sep, "b");
  assert.deepEqual(
    getAllowedUploadRoots(
      { SELDONFRAME_UPLOAD_ROOTS: `${a}${path.delimiter} ${b} ${path.delimiter}` },
      CWD,
    ),
    [CWD, a, b],
  );
});
