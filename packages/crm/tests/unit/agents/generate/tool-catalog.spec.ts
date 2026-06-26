// Agent Loop — L5 Self-Improving Generator — Task 1: the bindable tool catalog.
//
// tool-catalog.ts is the pure source of truth for the EXTERNAL tools the
// generator can suggest from an operator's sentence and bind onto an agent's
// blueprint. Every catalog entry maps 1:1 onto a real, WIRED connector so a
// match yields a VALID blueprint.connectors entry:
//   • postiz       → kind "vetted"   (VETTED_CONNECTORS[id="postiz"])
//   • googlesheets → kind "composio" (toolkitSlug "googledrive" — Sheets lives
//                    under the Drive managed session in the curated catalog)
//   • googlecalendar/gmail/notion/slack → kind "composio" (real toolkit slugs)
//
// These tests pin the contract:
//   • every TOOL_CATALOG entry has non-empty id/connectorKind/label/keywords;
//   • composio entries carry a toolkitSlug that is a REAL Composio catalog slug;
//     vetted entries map to a REAL VETTED_CONNECTORS id;
//   • the catalog includes postiz + googlesheets + notion;
//   • findToolsByKeywords matches Instagram/Facebook → postiz (deduped, one
//     entry); a no-tool sentence → []; and the short-keyword guard ("fax" must
//     NOT match the "x" keyword), and never throws.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  TOOL_CATALOG,
  findToolsByKeywords,
  toolCatalogForUi,
  type ToolCatalogEntry,
} from "../../../../src/lib/agents/generate/tool-catalog";
import { COMPOSIO_TOOLKIT_SLUGS } from "../../../../src/lib/integrations/composio/catalog";
import { VETTED_CONNECTORS } from "../../../../src/lib/agents/mcp/connectors";

/** Find a catalog entry by id (or fail the assertion). */
function entry(id: string): ToolCatalogEntry {
  const e = TOOL_CATALOG.find((x) => x.id === id);
  assert.ok(e, `TOOL_CATALOG should include an entry with id "${id}"`);
  return e!;
}

describe("TOOL_CATALOG — shape", () => {
  test("every entry has non-empty id / connectorKind / label / description / keywords", () => {
    assert.ok(TOOL_CATALOG.length > 0, "catalog should not be empty");
    for (const e of TOOL_CATALOG) {
      assert.equal(typeof e.id, "string");
      assert.ok(e.id.trim().length > 0, `id non-empty for ${JSON.stringify(e)}`);
      assert.ok(
        e.connectorKind.trim().length > 0,
        `connectorKind non-empty for ${e.id}`,
      );
      assert.ok(e.label.trim().length > 0, `label non-empty for ${e.id}`);
      assert.ok(
        e.description.trim().length > 0,
        `description non-empty for ${e.id}`,
      );
      assert.ok(
        Array.isArray(e.keywords) && e.keywords.length > 0,
        `keywords non-empty for ${e.id}`,
      );
      for (const kw of e.keywords) {
        assert.ok(
          typeof kw === "string" && kw.trim().length > 0,
          `every keyword non-empty for ${e.id}`,
        );
      }
    }
  });

  test("ids are unique", () => {
    const ids = TOOL_CATALOG.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicate ids");
  });

  test("connectorKind is only 'vetted' or 'composio' (the wired kinds)", () => {
    for (const e of TOOL_CATALOG) {
      assert.ok(
        e.connectorKind === "vetted" || e.connectorKind === "composio",
        `connectorKind "${e.connectorKind}" (${e.id}) must be a wired kind`,
      );
    }
  });
});

describe("TOOL_CATALOG — entries map onto REAL wired connectors", () => {
  test("composio entries carry a toolkitSlug that is a real Composio catalog slug", () => {
    const composio = TOOL_CATALOG.filter((e) => e.connectorKind === "composio");
    assert.ok(composio.length > 0, "expected at least one composio entry");
    for (const e of composio) {
      assert.ok(
        typeof e.toolkitSlug === "string" && e.toolkitSlug.length > 0,
        `composio entry ${e.id} must carry a toolkitSlug`,
      );
      assert.ok(
        COMPOSIO_TOOLKIT_SLUGS.includes(e.toolkitSlug!),
        `toolkitSlug "${e.toolkitSlug}" (${e.id}) must be in COMPOSIO_TOOLKIT_SLUGS [${COMPOSIO_TOOLKIT_SLUGS.join(", ")}]`,
      );
    }
  });

  test("vetted entries map onto a real VETTED_CONNECTORS id", () => {
    const vettedIds = new Set(VETTED_CONNECTORS.map((c) => c.id));
    const vetted = TOOL_CATALOG.filter((e) => e.connectorKind === "vetted");
    assert.ok(vetted.length > 0, "expected at least one vetted entry");
    for (const e of vetted) {
      assert.ok(
        vettedIds.has(e.id),
        `vetted entry id "${e.id}" must be a real VETTED_CONNECTORS id`,
      );
      // A vetted connector's endpoint is baked in, so no toolkitSlug.
      assert.equal(
        e.toolkitSlug,
        undefined,
        `vetted entry ${e.id} should not carry a toolkitSlug`,
      );
    }
  });
});

describe("TOOL_CATALOG — required coverage", () => {
  test("includes postiz (vetted, social)", () => {
    const e = entry("postiz");
    assert.equal(e.connectorKind, "vetted");
  });

  test("postiz description is multi-platform (not Instagram-exclusive)", () => {
    const { description } = entry("postiz");
    // The poster reaches well beyond Instagram — the description must name other
    // networks so the author (and the chip UI) frame it as multi-platform.
    assert.ok(
      description.includes("Facebook") || description.includes("LinkedIn"),
      `postiz description should name a non-IG platform (Facebook/LinkedIn); got: ${description}`,
    );
    // And it must not read as Instagram-only.
    assert.match(description, /multi-platform|Facebook|LinkedIn|TikTok|Twitter|X\//);
  });

  test("includes googlesheets (composio, real slug = googledrive)", () => {
    const e = entry("googlesheets");
    assert.equal(e.connectorKind, "composio");
    // Sheets actions live under the Drive toolkit in the curated catalog, so the
    // REAL slug this binds is googledrive (not a speculative "googlesheets").
    assert.equal(e.toolkitSlug, "googledrive");
    assert.ok(
      COMPOSIO_TOOLKIT_SLUGS.includes(e.toolkitSlug!),
      "googlesheets entry binds a real Composio slug",
    );
  });

  test("includes notion (composio, real slug = notion)", () => {
    const e = entry("notion");
    assert.equal(e.connectorKind, "composio");
    assert.equal(e.toolkitSlug, "notion");
  });

  test("postiz keywords include the social terms the plan requires", () => {
    const kws = entry("postiz").keywords;
    for (const required of [
      "social",
      "instagram",
      "facebook",
      "linkedin",
      "x",
      "twitter",
      "tiktok",
      "post",
      "schedule post",
      "reels",
    ]) {
      assert.ok(
        kws.includes(required),
        `postiz keywords should include "${required}"`,
      );
    }
  });
});

describe("toolCatalogForUi — the one UI-facing projection (P4)", () => {
  test("returns exactly the same ids as TOOL_CATALOG, in the same order (one source of truth)", () => {
    const uiIds = toolCatalogForUi().map((e) => e.id);
    const catalogIds = TOOL_CATALOG.map((e) => e.id);
    // Same ids → the editor's quick-chips can wire exactly what the generator's
    // author menu offers; nothing the UI shows is unbindable, nothing bindable is
    // hidden.
    assert.deepEqual(uiIds, catalogIds);
  });

  test("includes postiz + every projected entry carries a non-empty label + connectorKind", () => {
    const ui = toolCatalogForUi();
    assert.ok(
      ui.some((e) => e.id === "postiz"),
      "postiz (the vetted social tool) must be in the UI projection",
    );
    for (const e of ui) {
      assert.ok(e.label.trim().length > 0, `label non-empty for ${e.id}`);
      assert.ok(
        e.connectorKind === "vetted" || e.connectorKind === "composio",
        `connectorKind is a wired kind for ${e.id}`,
      );
    }
  });

  test("composio entries keep their toolkitSlug; vetted entries omit it (the binding key the chips toggle)", () => {
    for (const e of toolCatalogForUi()) {
      if (e.connectorKind === "composio") {
        assert.ok(
          typeof e.toolkitSlug === "string" && e.toolkitSlug.length > 0,
          `composio UI entry ${e.id} must carry its toolkitSlug`,
        );
      } else {
        assert.equal(
          e.toolkitSlug,
          undefined,
          `vetted UI entry ${e.id} should not carry a toolkitSlug`,
        );
      }
    }
  });

  test("projects each entry's label/description verbatim from TOOL_CATALOG (derived, not duplicated)", () => {
    const ui = toolCatalogForUi();
    for (const src of TOOL_CATALOG) {
      const got = ui.find((e) => e.id === src.id);
      assert.ok(got, `UI projection should include ${src.id}`);
      assert.equal(got!.label, src.label, `label matches source for ${src.id}`);
      assert.equal(
        got!.description,
        src.description,
        `description matches source for ${src.id}`,
      );
      assert.equal(
        got!.connectorKind,
        src.connectorKind,
        `connectorKind matches source for ${src.id}`,
      );
    }
  });
});

describe("findToolsByKeywords", () => {
  test("'post a weekly highlight to Instagram and Facebook' → includes postiz, deduped (one entry)", () => {
    const got = findToolsByKeywords(
      "post a weekly highlight to Instagram and Facebook",
    );
    const ids = got.map((e) => e.id);
    assert.ok(ids.includes("postiz"), "should match postiz");
    // Three postiz keywords matched (post / instagram / facebook) but the result
    // must contain postiz exactly once.
    assert.equal(
      ids.filter((id) => id === "postiz").length,
      1,
      "postiz must appear exactly once (deduped)",
    );
    // And no duplicate ids at all.
    assert.equal(new Set(ids).size, ids.length, "no duplicate entries");
  });

  test("a sentence with no tool words → []", () => {
    assert.deepEqual(
      findToolsByKeywords("greet the visitor and book them in"),
      [],
    );
  });

  test("short-keyword guard: a sentence with 'fax' does NOT match the 'x' keyword", () => {
    const got = findToolsByKeywords("send them a fax with the invoice");
    assert.deepEqual(got, [], "‘fax’ must not trip the ‘x’ keyword");
  });

  test("a standalone 'X' DOES match postiz (the social-network sense)", () => {
    const ids = findToolsByKeywords("share the update on X today").map(
      (e) => e.id,
    );
    assert.ok(ids.includes("postiz"), "standalone X matches postiz");
  });

  test("matches a Google Sheet sentence → googlesheets entry", () => {
    const ids = findToolsByKeywords(
      "log every new lead into a Google Sheet",
    ).map((e) => e.id);
    assert.ok(ids.includes("googlesheets"), "should match googlesheets");
  });

  test("a multi-tool sentence returns each tool once, in catalog order", () => {
    const got = findToolsByKeywords(
      "post the recap to Instagram and also drop it in Slack",
    );
    const ids = got.map((e) => e.id);
    assert.ok(ids.includes("postiz"), "matches postiz");
    assert.ok(ids.includes("slack"), "matches slack");
    assert.equal(new Set(ids).size, ids.length, "no duplicates");
    // Catalog order: postiz precedes slack in TOOL_CATALOG.
    assert.ok(
      ids.indexOf("postiz") < ids.indexOf("slack"),
      "results follow catalog order",
    );
  });

  test("never throws on odd input (non-string / empty / whitespace)", () => {
    // @ts-expect-error — intentionally passing a non-string to prove it's safe.
    assert.deepEqual(findToolsByKeywords(undefined), []);
    // @ts-expect-error — intentionally passing a non-string to prove it's safe.
    assert.deepEqual(findToolsByKeywords(null), []);
    // @ts-expect-error — intentionally passing a number to prove it's safe.
    assert.deepEqual(findToolsByKeywords(42), []);
    assert.deepEqual(findToolsByKeywords(""), []);
    assert.deepEqual(findToolsByKeywords("   "), []);
  });
});
