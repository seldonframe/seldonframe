// Agent Loop — L5 Self-Improving Generator — Task 2: bindToolsForIntent.
//
// bind-tools.ts is the PURE layer that turns a classified AgentIntent into the
// EXTERNAL connector bindings the operator's sentence implies. It runs the T1
// keyword matcher (findToolsByKeywords) over the intent's promptHint and maps
// each hit onto a REAL ConnectorBinding — byte-for-byte the shape a hand-bound
// connector produces:
//   • vetted (postiz)  → { id:"postiz", kind:"vetted", serviceName:"postiz",
//                          enabledTools:[] }  (matches bind.ts' provisional shape;
//                          VETTED_CONNECTORS[id="postiz"].secretService = "postiz")
//   • composio entries → { id:<toolkitSlug>, kind:"composio",
//                          enabledToolkits:[toolkitSlug], enabledTools:[the
//                          toolkit's curated default tools] }
//
// T6 (2026-07-11, prod incident follow-up): `enabledTools` for a composio
// binding used to be left EMPTY here (`[]`), on the assumption that a later
// discovery/picker step (bind.ts buildConnectorBinding, when the operator
// connects a live key) would fill it in. Prod data confirmed that assumption
// is wrong for GENERATED agents — they get no such follow-up step, so every
// generated starter's composio bindings resolved to ZERO real tools at
// runtime. `enabledTools` is now seeded with `defaultToolsForToolkits`'s
// curated default tool list for the toolkit; vetted (postiz) is unchanged —
// there's no toolkit-default catalog for vetted connectors.
//
// These tests pin the contract:
//   • a social-post sentence → a VALID vetted Postiz binding; warnings === [];
//   • a "log to Notion" sentence → a composio binding enabling the notion
//     toolkit, seeded with its curated default tools;
//   • a review-only sentence (no tool) → { connectors:[], warnings:[] };
//   • two keywords for the same tool (Instagram + Facebook) → ONE Postiz binding;
//   • every produced binding validates as a real ConnectorBinding (the Zod
//     connectorBindingSchema accepts it AND the discriminant + required fields
//     are present);
//   • undefined / empty intent fields never throw → empty result.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { bindToolsForIntent, bindToolIds } from "../../../../src/lib/agents/generate/bind-tools";
import type { AgentIntent } from "../../../../src/lib/agents/generate/parse-intent";
import {
  connectorBindingSchema,
  type ConnectorBinding,
} from "../../../../src/lib/agents/mcp/connectors";
import { defaultToolsForToolkits } from "../../../../src/lib/integrations/composio/catalog";

/** A complete, valid AgentIntent with the given sentence as its promptHint. */
function intentWith(promptHint: string | undefined): AgentIntent {
  return {
    skill: "speed-to-lead",
    trigger: { kind: "inbound", channel: "chat" },
    promptHint,
  } as AgentIntent;
}

/** Assert a value is a real ConnectorBinding: it must PARSE through the canonical
 *  Zod schema (so it's indistinguishable from a hand-bound one) and carry the
 *  discriminant. Returns the parsed binding. */
function assertValidBinding(b: unknown): ConnectorBinding {
  const parsed = connectorBindingSchema.safeParse(b);
  assert.ok(
    parsed.success,
    `binding should validate as a real ConnectorBinding: ${
      parsed.success ? "" : JSON.stringify(parsed.error.issues)
    }`,
  );
  return parsed.data;
}

describe("bindToolsForIntent — vetted (Postiz)", () => {
  test("a social-post intent yields a valid vetted Postiz binding; warnings === []", () => {
    const { connectors, warnings } = bindToolsForIntent(
      intentWith("post a weekly highlight to Instagram"),
    );

    assert.equal(warnings.length, 0, "pure layer never produces warnings");

    const postiz = connectors.find((c) => c.id === "postiz");
    assert.ok(postiz, "should include a Postiz binding");
    assert.equal(postiz!.kind, "vetted");
    // Exact shape a hand-bound Postiz produces (bind.ts provisional binding).
    assert.deepEqual(postiz, {
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      enabledTools: [],
    });
    assertValidBinding(postiz);
  });

  test("the produced vetted binding has its required discriminated-union fields", () => {
    const { connectors } = bindToolsForIntent(
      intentWith("schedule a reels caption for our social media"),
    );
    const postiz = assertValidBinding(connectors[0]);
    assert.equal(postiz.kind, "vetted");
    if (postiz.kind === "vetted") {
      assert.equal(postiz.id, "postiz");
      assert.equal(postiz.serviceName, "postiz");
      assert.ok(Array.isArray(postiz.enabledTools));
    }
  });
});

describe("bindToolsForIntent — vetted OAuth (Circle)", () => {
  test("a Circle-mastermind pairing sentence yields a valid vetted Circle binding; warnings === []", () => {
    const { connectors, warnings } = bindToolsForIntent(
      intentWith("pair up active members of my Circle mastermind each month"),
    );
    assert.equal(warnings.length, 0, "pure layer never produces warnings");

    const circle = connectors.find((c) => c.id === "circle");
    assert.ok(circle, "should include a Circle binding");
    assert.deepEqual(circle, {
      id: "circle",
      kind: "vetted",
      serviceName: "circle",
      enabledTools: [],
    });
    assertValidBinding(circle);
  });

  test("a figurative \"circle back\" sentence still matches (whole-word matcher, no semantic disambiguation) — accepted-suggestion noise, never an error", () => {
    // findToolsByKeywords is a whole-word (not semantic) matcher — "circle" as a
    // standalone word matches regardless of "circle back" idiom vs the Circle
    // product. Per the design (§D), this is accepted suggestion noise (the
    // operator can just not click bind it), never surfaced as an error/throw.
    const { connectors, warnings } = bindToolsForIntent(
      intentWith("let's circle back next week on the proposal"),
    );
    assert.equal(warnings.length, 0);
    assert.ok(
      connectors.some((c) => c.id === "circle"),
      "the whole-word matcher is expected to match here too — documented tradeoff, not a bug",
    );
  });
});

describe("bindToolsForIntent — composio", () => {
  test("a 'log to Notion' intent yields a composio binding enabling the notion toolkit", () => {
    const { connectors, warnings } = bindToolsForIntent(
      intentWith("log every lead to Notion"),
    );

    assert.equal(warnings.length, 0);

    const notion = connectors.find((c) => c.kind === "composio" && c.id === "notion");
    assert.ok(notion, "should include a composio Notion binding");
    const parsed = assertValidBinding(notion);
    assert.equal(parsed.kind, "composio");
    if (parsed.kind === "composio") {
      assert.deepEqual(parsed, {
        id: "notion",
        kind: "composio",
        enabledToolkits: ["notion"],
        enabledTools: defaultToolsForToolkits(["notion"]),
      });
      assert.notDeepEqual(parsed.enabledTools, []);
    }
  });

  test("a 'log to a Google Sheet' intent binds the real googledrive toolkit slug, seeded with its curated default tools", () => {
    const { connectors } = bindToolsForIntent(
      intentWith("log every lead into a Google Sheet"),
    );
    // The catalog entry id is "googlesheets" but the REAL Composio slug is
    // "googledrive" — the binding's id + enabledToolkits use the slug.
    const sheet = connectors.find((c) => c.kind === "composio" && c.id === "googledrive");
    assert.ok(sheet, "should bind the googledrive toolkit for a Google Sheet sentence");
    const parsed = assertValidBinding(sheet);
    if (parsed.kind === "composio") {
      assert.deepEqual(parsed.enabledToolkits, ["googledrive"]);
      assert.deepEqual(parsed.enabledTools, defaultToolsForToolkits(["googledrive"]));
    }
  });
});

describe("bindToolIds — the explicit-id binder (T6 regression)", () => {
  test("an explicit composio catalog id (gmail) is seeded with its curated default tools, never an empty allowlist", () => {
    const connectors = bindToolIds(["gmail"]);
    const gmail = connectors.find((c) => c.kind === "composio" && c.id === "gmail");
    assert.ok(gmail, "should include a composio Gmail binding");
    if (gmail!.kind === "composio") {
      assert.deepEqual(gmail!.enabledTools, defaultToolsForToolkits(["gmail"]));
    }
  });

  test("an explicit vetted catalog id (postiz) is unchanged — still an empty allowlist", () => {
    const connectors = bindToolIds(["postiz"]);
    const postiz = connectors.find((c) => c.kind === "vetted" && c.id === "postiz");
    assert.ok(postiz, "should include a vetted Postiz binding");
    assert.deepEqual((postiz as { enabledTools: string[] }).enabledTools, []);
  });
});

describe("bindToolsForIntent — no tool", () => {
  test("a review-requester sentence (no external tool) → connectors:[], warnings:[]", () => {
    const result = bindToolsForIntent(
      intentWith("text happy customers for a google review"),
    );
    assert.deepEqual(result, { connectors: [], warnings: [] });
  });
});

describe("bindToolsForIntent — dedup", () => {
  test("two keywords for the same tool (Instagram + Facebook) → ONE Postiz binding", () => {
    const { connectors } = bindToolsForIntent(
      intentWith("post highlights to Instagram and Facebook every week"),
    );
    const postizCount = connectors.filter((c) => c.id === "postiz").length;
    assert.equal(postizCount, 1, "Postiz must be bound exactly once");
  });

  test("each produced binding is unique by kind+id (no duplicates across the array)", () => {
    const { connectors } = bindToolsForIntent(
      intentWith("post to Instagram, log leads to Notion, and post to Facebook"),
    );
    const keys = connectors.map((c) => `${c.kind}:${c.id}`);
    assert.equal(new Set(keys).size, keys.length, "no duplicate kind+id bindings");
    // Every binding validates.
    for (const c of connectors) assertValidBinding(c);
  });
});

describe("bindToolsForIntent — robustness (never throws)", () => {
  test("undefined promptHint → empty result, no throw", () => {
    const result = bindToolsForIntent(intentWith(undefined));
    assert.deepEqual(result, { connectors: [], warnings: [] });
  });

  test("empty / whitespace promptHint → empty result", () => {
    assert.deepEqual(bindToolsForIntent(intentWith("")), { connectors: [], warnings: [] });
    assert.deepEqual(bindToolsForIntent(intentWith("   ")), { connectors: [], warnings: [] });
  });

  test("an undefined/garbage intent never throws", () => {
    // The action layer always passes a real intent, but the pure fn must be
    // bullet-proof regardless.
    assert.doesNotThrow(() => bindToolsForIntent(undefined as unknown as AgentIntent));
    assert.doesNotThrow(() =>
      bindToolsForIntent({} as unknown as AgentIntent),
    );
    assert.doesNotThrow(() =>
      bindToolsForIntent({ promptHint: 42 } as unknown as AgentIntent),
    );
    assert.deepEqual(bindToolsForIntent(undefined as unknown as AgentIntent), {
      connectors: [],
      warnings: [],
    });
  });
});
