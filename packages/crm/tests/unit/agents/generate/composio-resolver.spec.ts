// Agent Loop — World-Class Author (P5.2) — the LIVE Composio toolkit resolver.
//
// composio-resolver.ts turns the author's `neededCapabilities` (plain-English
// asks like "read this business's Google reviews") into REAL composio
// ConnectorBindings, via Composio's live toolkit catalog. These tests pin the
// contract with a FAKE toolkit list — NO network, NO @composio/core, NO key:
//
//   • resolveCapabilitiesToToolkits maps a Google-reviews phrase → the
//     "googlebusiness" slug (name+description keyword overlap);
//   • a capability with no plausible toolkit → [] (the min-score guard);
//   • bindComposioToolkits(slugs) → valid composio bindings that each parse
//     through the canonical connectorBindingSchema; duplicate slugs collapse;
//   • listComposioToolkits with no fetch dep + no COMPOSIO_API_KEY → [] (fail
//     soft, no throw); with an injected fetch fn → its list, and a 2nd call
//     returns the CACHED value without re-invoking the fetch (called once).

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  listComposioToolkits,
  resolveCapabilitiesToToolkits,
  bindComposioToolkits,
  __resetComposioToolkitCacheForTests,
  type ComposioToolkitInfo,
} from "../../../../src/lib/agents/generate/composio-resolver";
import {
  connectorBindingSchema,
  type ConnectorBinding,
} from "../../../../src/lib/agents/mcp/connectors";
import { defaultToolsForToolkits } from "../../../../src/lib/integrations/composio/catalog";

/** A representative fake catalog: Google Business Profile (the GMB long-tail
 *  case), plus a spread of unrelated toolkits so the matcher has to discriminate. */
const FAKE_TOOLKITS: ComposioToolkitInfo[] = [
  {
    slug: "googlebusiness",
    name: "Google Business Profile",
    description: "reviews, posts, locations",
  },
  { slug: "notion", name: "Notion", description: "pages, databases, notes" },
  { slug: "slack", name: "Slack", description: "channels, messages, chat" },
  { slug: "stripe", name: "Stripe", description: "payments, invoices, charges" },
  { slug: "trello", name: "Trello", description: "boards, cards, lists" },
];

/** Assert a value parses as a real ConnectorBinding via the canonical schema. */
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

describe("resolveCapabilitiesToToolkits — matching", () => {
  test("a Google-reviews capability resolves to the googlebusiness slug", () => {
    const resolved = resolveCapabilitiesToToolkits(
      ["read this business's Google reviews"],
      FAKE_TOOLKITS,
    );
    assert.equal(resolved.length, 1, "exactly one capability resolves");
    assert.equal(resolved[0].slug, "googlebusiness");
    assert.equal(resolved[0].label, "Google Business Profile");
    assert.equal(resolved[0].capability, "read this business's Google reviews");
  });

  test("a 'create a Trello card' capability resolves to trello", () => {
    const resolved = resolveCapabilitiesToToolkits(
      ["create a Trello card on our board"],
      FAKE_TOOLKITS,
    );
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].slug, "trello");
  });

  test("multiple capabilities each resolve to their best toolkit", () => {
    const resolved = resolveCapabilitiesToToolkits(
      [
        "read this business's Google reviews",
        "charge a card via Stripe payments",
      ],
      FAKE_TOOLKITS,
    );
    const slugs = resolved.map((r) => r.slug).sort();
    assert.deepEqual(slugs, ["googlebusiness", "stripe"]);
  });

  test("a capability with no plausible toolkit → [] (min-score guard)", () => {
    const resolved = resolveCapabilitiesToToolkits(
      ["forecast tomorrow's weather in Tokyo"],
      FAKE_TOOLKITS,
    );
    assert.deepEqual(resolved, [], "no weak/accidental match");
  });

  test("a single shared generic word is NOT enough to match (needs ≥2 tokens)", () => {
    // "create" alone overlaps Trello's domain loosely but is a stopword/too
    // weak — without a second discriminating token there must be no match.
    const resolved = resolveCapabilitiesToToolkits(
      ["create something"],
      FAKE_TOOLKITS,
    );
    assert.deepEqual(resolved, []);
  });

  test("resolution dedupes by slug — two phrases hitting the same toolkit yield one", () => {
    const resolved = resolveCapabilitiesToToolkits(
      [
        "read this business's Google reviews",
        "reply to Google Business Profile reviews and posts",
      ],
      FAKE_TOOLKITS,
    );
    const googlebusiness = resolved.filter((r) => r.slug === "googlebusiness");
    assert.equal(googlebusiness.length, 1, "googlebusiness bound at most once");
  });
});

describe("resolveCapabilitiesToToolkits — robustness (never throws)", () => {
  test("empty inputs → []", () => {
    assert.deepEqual(resolveCapabilitiesToToolkits([], FAKE_TOOLKITS), []);
    assert.deepEqual(resolveCapabilitiesToToolkits(["x"], []), []);
  });

  test("garbage inputs never throw", () => {
    assert.doesNotThrow(() =>
      resolveCapabilitiesToToolkits(
        undefined as unknown as string[],
        FAKE_TOOLKITS,
      ),
    );
    assert.doesNotThrow(() =>
      resolveCapabilitiesToToolkits(
        [undefined as unknown as string, ""],
        FAKE_TOOLKITS,
      ),
    );
    assert.deepEqual(
      resolveCapabilitiesToToolkits(
        [undefined as unknown as string, "   "],
        FAKE_TOOLKITS,
      ),
      [],
    );
  });
});

describe("bindComposioToolkits — binding shape", () => {
  test("maps slugs to valid composio bindings (each parses via connectorBindingSchema)", () => {
    const bindings = bindComposioToolkits(["googlebusiness", "notion"]);
    assert.equal(bindings.length, 2, "two distinct slugs → two bindings");

    for (const b of bindings) assertValidBinding(b);

    const gb = bindings.find((b) => b.id === "googlebusiness");
    assert.ok(gb, "googlebusiness binding present");
    // "googlebusiness" is a live-Composio-only, long-tail toolkit — NOT one
    // of the 8 curated COMPOSIO_TOOLKITS (gmail, googlecalendar, googledrive,
    // slack, notion, hubspot, quickbooks, outlook), so there's no curated
    // default tool list to seed for it; it still resolves to [].
    assert.deepEqual(gb, {
      id: "googlebusiness",
      kind: "composio",
      enabledToolkits: ["googlebusiness"],
      enabledTools: [],
    });
  });

  // F-C (2026-07-11, closes the empty-allowlist bug class — same as T1's
  // compile-agent.ts fix and T6's bind-tools.ts fix): a generated agent has
  // no later discovery step to fill `enabledTools` in, so a CURATED-catalog
  // slug (one of the 8 in COMPOSIO_TOOLKITS) resolved through this long-tail
  // path must ALSO be seeded with its curated default tools — never [].
  test("a curated-catalog slug (notion) is seeded with its curated default tools, never an empty allowlist", () => {
    const [binding] = bindComposioToolkits(["notion"]);
    assert.ok(binding && binding.kind === "composio");
    assert.deepEqual(
      (binding as { enabledTools: string[] }).enabledTools,
      defaultToolsForToolkits(["notion"]),
    );
    assert.notDeepEqual((binding as { enabledTools: string[] }).enabledTools, []);
  });

  test("duplicate slugs collapse to one binding", () => {
    const bindings = bindComposioToolkits([
      "notion",
      "notion",
      "NOTION",
      " notion ",
    ]);
    assert.equal(bindings.length, 1, "all notion variants collapse to one");
    assert.equal(bindings[0].id, "notion");
    assertValidBinding(bindings[0]);
  });

  test("empty/garbage slugs are dropped; never throws", () => {
    assert.deepEqual(bindComposioToolkits([]), []);
    assert.deepEqual(bindComposioToolkits(["", "   "]), []);
    assert.doesNotThrow(() =>
      bindComposioToolkits([undefined as unknown as string, 42 as unknown as string]),
    );
    assert.deepEqual(
      bindComposioToolkits([undefined as unknown as string, "slack"]).map((b) => b.id),
      ["slack"],
    );
  });

  test("end-to-end: resolve → bind produces schema-valid bindings", () => {
    const resolved = resolveCapabilitiesToToolkits(
      ["read this business's Google reviews", "create a Trello card"],
      FAKE_TOOLKITS,
    );
    const bindings = bindComposioToolkits(resolved.map((r) => r.slug));
    assert.equal(bindings.length, 2);
    for (const b of bindings) assertValidBinding(b);
  });
});

describe("listComposioToolkits — fail-soft + cache", () => {
  beforeEach(() => {
    __resetComposioToolkitCacheForTests();
    // Ensure the live path can't accidentally fire (no key → []).
    delete process.env.COMPOSIO_API_KEY;
  });

  test("no fetch dep + no COMPOSIO_API_KEY → [] (fail soft, no throw)", async () => {
    const list = await listComposioToolkits();
    assert.deepEqual(list, []);
  });

  test("an injected fetchToolkits is used and its result returned", async () => {
    const list = await listComposioToolkits({
      fetchToolkits: async () => FAKE_TOOLKITS,
    });
    assert.equal(list.length, FAKE_TOOLKITS.length);
    assert.equal(list[0].slug, "googlebusiness");
  });

  test("the live list is cached — a 2nd call does NOT re-invoke the fetch fn", async () => {
    let calls = 0;
    const fetchToolkits = async () => {
      calls += 1;
      return FAKE_TOOLKITS;
    };

    const first = await listComposioToolkits({ fetchToolkits });
    const second = await listComposioToolkits({ fetchToolkits });

    assert.equal(calls, 1, "fetch fn invoked exactly once (cached thereafter)");
    assert.equal(first, second, "same cached array reference returned");
    assert.equal(second.length, FAKE_TOOLKITS.length);
  });

  test("a rejecting fetch fn fails soft to [] (and never throws)", async () => {
    let list: ComposioToolkitInfo[] | undefined;
    await assert.doesNotReject(async () => {
      list = await listComposioToolkits({
        fetchToolkits: async () => {
          throw new Error("network down");
        },
      });
    });
    assert.deepEqual(list, []);
  });
});
