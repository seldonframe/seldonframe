// Unit tests for the powered-by badge — the R1 growth loop that renders
// "⚡ Built with SeldonFrame" on every generated /w site footer.
//
// `buildPoweredByHref` is a PURE function (exported for unit testing, same
// convention as `resolveShellStyle` / `buildServiceNavLinks` elsewhere in
// landing-r1) — exact URL shape incl. encoding is pinned here. The component
// itself is a zero-JS server component (no "use client"), so it's tested the
// same way footer.spec.ts tests LandingFooter: render the element tree
// directly (no renderer, no DOM) and flatten/inspect props + text.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPoweredByHref,
  PoweredByBadge,
} from "../../../src/components/landing-r1/powered-by-badge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type AnyEl = { props?: Record<string, unknown>; type?: unknown };

function flatten(node: unknown, acc: AnyEl[] = []): AnyEl[] {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const c of node) flatten(c, acc);
    return acc;
  }
  const el = node as AnyEl;
  acc.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) for (const c of children) flatten(c, acc);
  else if (children) flatten(children, acc);
  return acc;
}

function safeText(node: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(node, (_key, value) => {
    if (typeof value === "function") return undefined;
    if (typeof value === "object" && value !== null) {
      if (seen.has(value as object)) return "[Circular]";
      seen.add(value as object);
    }
    return value;
  });
}

describe("buildPoweredByHref", () => {
  test("builds the exact URL shape with ref + utm_source", () => {
    const href = buildPoweredByHref("ws_abc123");
    assert.equal(
      href,
      "https://www.seldonframe.com/build?ref=ws_abc123&utm_source=powered_by",
    );
  });

  test("URL-encodes a workspaceId with special characters", () => {
    const href = buildPoweredByHref("org id/with & chars?");
    const url = new URL(href);
    assert.equal(url.origin, "https://www.seldonframe.com");
    assert.equal(url.pathname, "/build");
    // searchParams.get decodes for us — confirms round-trip correctness
    // regardless of how encodeURIComponent chose to escape each char.
    assert.equal(url.searchParams.get("ref"), "org id/with & chars?");
    assert.equal(url.searchParams.get("utm_source"), "powered_by");
  });

  test("does not double-encode an already-safe workspaceId", () => {
    const href = buildPoweredByHref("ws-plain-slug-123");
    assert.equal(
      href,
      "https://www.seldonframe.com/build?ref=ws-plain-slug-123&utm_source=powered_by",
    );
  });

  test("empty workspaceId still produces a well-formed URL (fail-soft, no throw)", () => {
    const href = buildPoweredByHref("");
    const url = new URL(href);
    assert.equal(url.searchParams.get("ref"), "");
    assert.equal(url.searchParams.get("utm_source"), "powered_by");
  });
});

describe("PoweredByBadge", () => {
  test("renders the exact copy: lightning bolt + Built with SeldonFrame + IDE line", () => {
    const result = PoweredByBadge({ workspaceId: "ws_abc123" });
    const text = safeText(result);
    assert.match(text, /Built with SeldonFrame/);
    assert.match(text, /build yours from your IDE/i);
    // The lightning-bolt glyph from the spec copy.
    assert.match(text, /⚡/);
  });

  test("the anchor href is the ref-attributed build URL for this workspace", () => {
    const result = PoweredByBadge({ workspaceId: "ws_abc123" });
    const links = flatten(result).filter(
      (el) => typeof (el.props as { href?: string })?.href === "string",
    );
    const hrefs = links.map((el) => (el.props as { href: string }).href);
    assert.ok(
      hrefs.includes(
        "https://www.seldonframe.com/build?ref=ws_abc123&utm_source=powered_by",
      ),
      `expected a link to the ref-attributed build URL, got: ${JSON.stringify(hrefs)}`,
    );
  });

  test("different workspaceId props produce different ref hrefs (per-site attribution)", () => {
    const a = flatten(PoweredByBadge({ workspaceId: "ws_one" })).find(
      (el) => typeof (el.props as { href?: string })?.href === "string",
    );
    const b = flatten(PoweredByBadge({ workspaceId: "ws_two" })).find(
      (el) => typeof (el.props as { href?: string })?.href === "string",
    );
    assert.notEqual(
      (a?.props as { href?: string })?.href,
      (b?.props as { href?: string })?.href,
    );
  });

  test("opens in a new tab safely: target=_blank + rel=noopener", () => {
    const result = PoweredByBadge({ workspaceId: "ws_abc123" });
    const link = flatten(result).find(
      (el) => typeof (el.props as { href?: string })?.href === "string",
    );
    assert.equal((link?.props as { target?: string })?.target, "_blank");
    const rel = (link?.props as { rel?: string })?.rel ?? "";
    assert.match(rel, /noopener/);
  });

  test("is a zero-client-JS server component — no 'use client' directive in source", async () => {
    const src = await fs.readFile(
      path.resolve(
        __dirname,
        "../../../src/components/landing-r1/powered-by-badge.tsx",
      ),
      "utf8",
    );
    assert.doesNotMatch(src.trimStart(), /^"use client"/);
  });
});
