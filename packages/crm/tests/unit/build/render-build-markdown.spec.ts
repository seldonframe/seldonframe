// /build → clean Markdown (the agent-legible twin of the developer landing).
//
// SINGLE SOURCE OF TRUTH: this renders from the SAME pure copy modules the HTML
// /build page renders (lib/build/landing-content + the SKILL.md path/MCP
// constants), so the Markdown twin can NEVER drift from the page. These tests
// pin the load-bearing facts an IDE agent fetching /build.md needs — the
// build→list→price→run pitch, the SKILL setup command, the MCP connect line, the
// key/wallet paths, and the honest 95/5 split — AND the cross-surface invariant
// that those facts match landing-content (hence SKILL.md).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { renderBuildMarkdown, buildUrl } from "../../../src/lib/build/render-build-markdown";
import {
  BUILD_SETUP_COMMAND,
  BUILD_KEYS_PATH,
  BUILD_WALLET_PATH,
  BUILD_MCP_URL,
  BUILDER_KEEP_PCT,
  SELDONFRAME_FEE_PCT,
  buildLandingConnectSnippet,
  IDE_INSTALLS,
  IDE_NPM_PACKAGE,
  IDE_NO_KEY_EXAMPLE,
} from "../../../src/lib/build/landing-content";

describe("renderBuildMarkdown", () => {
  const md = renderBuildMarkdown();

  test("is non-trivial Markdown opening with an H1 naming the builder surface", () => {
    assert.ok(md.length > 600, "the /build twin should be a substantial doc");
    const firstLine = md.split("\n").find((l) => l.trim().length > 0) ?? "";
    assert.match(firstLine, /^#\s/, "first non-empty line is an H1");
    assert.match(firstLine, /SeldonFrame/i);
  });

  test("leads with the one-command SKILL.md set-up funnel (matches the page/SKILL.md)", () => {
    assert.ok(md.includes(BUILD_SETUP_COMMAND), "must include the exact set-up command");
    assert.match(BUILD_SETUP_COMMAND, /^set up https:\/\/seldonframe\.com\/SKILL\.md$/);
  });

  test("documents the build → list → price flow by the real MCP tool names", () => {
    for (const tool of ["create_agent", "run_agent_evals", "publish_agent", "set_usage_price"]) {
      assert.ok(md.includes(tool), `/build.md should name the ${tool} tool`);
    }
  });

  test("documents the discover → inspect → run consumption flow", () => {
    for (const step of ["discover", "inspect", "run"]) {
      assert.match(md, new RegExp(`\\b${step}\\b`, "i"), `/build.md should name the ${step} step`);
    }
  });

  test("carries the MCP connect line — the shared `claude mcp add` snippet + the MCP origin", () => {
    assert.ok(md.includes(BUILD_MCP_URL), "must include the MCP origin");
    // The SAME connect snippet the page + reveal panel + SKILL.md render.
    assert.ok(md.includes(buildLandingConnectSnippet()), "must embed the shared connect snippet");
    assert.match(md, /claude mcp add seldonframe/);
    assert.match(md, /Authorization: Bearer/);
  });

  test("points to the key + wallet paths", () => {
    assert.ok(md.includes(BUILD_KEYS_PATH), "must link the developer-key path");
    assert.ok(md.includes(BUILD_WALLET_PATH), "must link the wallet path");
  });

  test("is money-honest: list free, keep the builder split, the clean fee, errors not charged", () => {
    const lower = md.toLowerCase();
    assert.match(lower, /listing is free|list free|free to list/);
    assert.ok(md.includes(`${BUILDER_KEEP_PCT}%`), "states the builder keep %");
    assert.ok(md.includes(`${SELDONFRAME_FEE_PCT}%`), "states the SeldonFrame fee %");
    assert.match(lower, /never charged/);
  });

  test("absolute links use the canonical base by default; the base is overridable", () => {
    // Default base → clickable absolute /build URL in a pasted .md.
    assert.ok(md.includes("https://seldonframe.com/build"), "default base yields absolute links");
    // Overridable for preview hosts.
    const preview = renderBuildMarkdown("https://example.test/");
    assert.ok(preview.includes("https://example.test/build"), "base override is honored");
    assert.ok(!preview.includes("https://seldonframe.com/build"), "no default-base leakage when overridden");
  });

  test("advertises its human twin — links back to the /build HTML page", () => {
    assert.ok(md.includes(buildUrl()), "links to the /build page");
  });

  test("is deterministic (same output every call)", () => {
    assert.equal(renderBuildMarkdown(), md);
  });

  describe("One server. Every IDE.", () => {
    test("has the section heading", () => {
      assert.match(md, /## One server\. Every IDE\./);
    });

    test("names all six IDEs with an H3 each", () => {
      for (const ide of IDE_INSTALLS) {
        assert.match(md, new RegExp(`### ${ide.name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`));
      }
      assert.equal(IDE_INSTALLS.length, 6, "expected exactly 6 IDE entries");
    });

    test("every entry's exact snippet is embedded verbatim (no drift from landing-content)", () => {
      for (const ide of IDE_INSTALLS) {
        const snippet = ide.kind === "cli" ? ide.cliCommand! : ide.fileContents!;
        assert.ok(md.includes(snippet), `/build.md must embed the ${ide.name} snippet verbatim`);
      }
    });

    test("file-based entries print their config path", () => {
      for (const ide of IDE_INSTALLS.filter((i) => i.kind === "file")) {
        assert.ok(md.includes(ide.filePath!), `/build.md must print the ${ide.name} config path`);
      }
    });

    test("every snippet installs the published npm package", () => {
      for (const ide of IDE_INSTALLS) {
        const snippet = ide.kind === "cli" ? ide.cliCommand! : ide.fileContents!;
        assert.ok(snippet.includes(IDE_NPM_PACKAGE), `${ide.name} snippet must reference ${IDE_NPM_PACKAGE}`);
      }
    });

    test("states no upfront key is needed and gives the natural-language example", () => {
      assert.match(md, /no upfront key|needs no API key/i);
      assert.ok(md.includes(IDE_NO_KEY_EXAMPLE), "must include the example prompt");
    });
  });
});
