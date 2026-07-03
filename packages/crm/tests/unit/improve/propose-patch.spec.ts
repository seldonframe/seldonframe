// Improve verb + trust rail (2026-07-02) — Task 7: patch proposer + pure guardrails.
//
// TDD focus: two independent pieces per the design doc's "4. propose-patch.ts"
// section + the plan's Task 7 binding rules:
//
//   1. `validateProposedPatch` — PURE, field-name-agnostic (so blueprint field
//      evolution can never rot it; it never hard-codes an allowlist of
//      blueprint keys). Rules, all binding:
//        - the candidate patch must be a plain object — an array, `null`, or
//          a primitive (string/number/boolean) is rejected;
//        - every top-level key on the patch must ALREADY exist as a key on
//          `currentBlueprint` (the SUBSET rule) — a patch introducing a new
//          top-level key the blueprint doesn't have is rejected, even though
//          nothing here hard-codes what those keys ARE;
//        - `connectors` and `trigger` are ALWAYS rejected keys, even when
//          they exist on `currentBlueprint` — these are the two axes the
//          design doc says the improve loop must never silently touch
//          (connectors = external tool bindings w/ secrets; trigger = what
//          fires the agent at all);
//        - `JSON.stringify(patch).length <= maxBytes` — a size cap the
//          CALLER supplies (this module never reads `SF_IMPROVE_PATCH_MAX_BYTES`
//          itself, per the brief: "do not read env here");
//        - the happy path returns `{ ok: true, patch }` with the patch
//          object passed through unchanged (not cloned/mutated — same
//          reference), typed `Partial<AgentBlueprint>`.
//
//   2. `makeLlmPatchProposer` — the LLM branch. MIRRORS makeLlmFailureClusterer
//      / makeLlmEvalGrader / makeLlmScenarioGenerator in DI shape (`{ getClient }`,
//      defaulting to getAnthropicClient in the real factory — tests always
//      inject a fake/throwing client here, matching the sibling specs'
//      convention of never touching the network). The prompt is given the
//      blueprint + failure clusters + Brain lessons and told to return the
//      MINIMAL JSON patch + a short rationale string. Parse posture is
//      fail-soft -> `null` on ANY bad path (no client, network throw,
//      non-JSON text, wrong shape) — UNLIKE the clusterer's "never lose a
//      failure" floor, a patch proposal that can't be trusted is safe to
//      simply not propose (a human always has the "nothing changed" option).
//
//      Chosen behavior for an EMPTY `clusters` list (documented per the
//      brief: "pick one behavior and test it"): the proposer is still
//      INVOKED (an operator may have Brain lessons worth acting on even with
//      no failing scenarios this run) — it is NOT short-circuited to `null`
//      the way `makeLlmFailureClusterer` short-circuits an empty remainder to
//      `[]` with no LLM call. Whether a patch comes back with an empty
//      clusters list depends entirely on what the (fake, in these tests)
//      client returns — there is nothing here that forces a `null` result
//      purely because `clusters` was `[]`.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateProposedPatch,
  makeLlmPatchProposer,
} from "@/lib/agents/improve/propose-patch";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { FailureCluster } from "@/lib/agents/improve/cluster-failures";

// ─── fakes ───────────────────────────────────────────────────────────────

function blueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    archetype: "receptionist",
    greeting: "Hi, how can I help?",
    faq: [{ q: "What are your hours?", a: "9-5 Mon-Fri" }],
    capabilities: ["book_appointment"],
    connectors: [],
    trigger: { kind: "inbound" } as unknown as AgentBlueprint["trigger"],
    ...overrides,
  };
}

function cluster(overrides: Partial<FailureCluster> = {}): FailureCluster {
  return {
    mode: "pricing",
    count: 2,
    exampleScenarioIds: ["s1", "s2"],
    evidence: ["Quoted a firm price not in the operator's pricing facts."],
    ...overrides,
  };
}

/** A minimal fake Anthropic client shape — only `messages.create` is called
 *  by the proposer, matching cluster-failures.spec.ts / score-llm's own
 *  fakes-in-tests convention (no real @anthropic-ai/sdk instance needed). */
function fakeClient(text: string) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text }],
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

function throwingClient() {
  return {
    messages: {
      create: async () => {
        throw new Error("network down");
      },
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

// ─── validateProposedPatch ────────────────────────────────────────────────

describe("validateProposedPatch", () => {
  test("happy path: a patch whose keys are a subset of currentBlueprint's keys (excluding connectors/trigger) is accepted", () => {
    const bp = blueprint();
    const patch = { greeting: "Hey there! How can I help today?" };
    const result = validateProposedPatch({ patch, currentBlueprint: bp, maxBytes: 8192 });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.patch, patch);
      // Same reference — the happy path passes the patch through unchanged,
      // it does not clone it.
      assert.equal(result.patch, patch);
    }
  });

  test("happy path with multiple valid keys at once", () => {
    const bp = blueprint();
    const patch = {
      greeting: "New greeting",
      faq: [{ q: "Do you offer refunds?", a: "Yes, within 30 days." }],
    };
    const result = validateProposedPatch({ patch, currentBlueprint: bp, maxBytes: 8192 });
    assert.equal(result.ok, true);
  });

  test("an empty object patch is accepted (vacuously a subset, under the size cap)", () => {
    const bp = blueprint();
    const result = validateProposedPatch({ patch: {}, currentBlueprint: bp, maxBytes: 8192 });
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.patch, {});
  });

  test("rejects a patch that is an array, not a plain object", () => {
    const bp = blueprint();
    const result = validateProposedPatch({ patch: [], currentBlueprint: bp, maxBytes: 8192 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.length > 0);
  });

  test("rejects a patch that is null", () => {
    const bp = blueprint();
    const result = validateProposedPatch({ patch: null, currentBlueprint: bp, maxBytes: 8192 });
    assert.equal(result.ok, false);
  });

  test("rejects a patch that is a string primitive", () => {
    const bp = blueprint();
    const result = validateProposedPatch({
      patch: "greeting: hello",
      currentBlueprint: bp,
      maxBytes: 8192,
    });
    assert.equal(result.ok, false);
  });

  test("rejects a patch that is a number primitive", () => {
    const bp = blueprint();
    const result = validateProposedPatch({ patch: 42, currentBlueprint: bp, maxBytes: 8192 });
    assert.equal(result.ok, false);
  });

  test("rejects a patch that is a boolean primitive", () => {
    const bp = blueprint();
    const result = validateProposedPatch({ patch: true, currentBlueprint: bp, maxBytes: 8192 });
    assert.equal(result.ok, false);
  });

  test("rejects a patch introducing a top-level key NOT present on currentBlueprint (subset rule)", () => {
    const bp = blueprint();
    const result = validateProposedPatch({
      patch: { notARealBlueprintField: "sneaky" },
      currentBlueprint: bp,
      maxBytes: 8192,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.length > 0);
  });

  test("rejects a patch with a mix of valid and invalid keys (one bad key rejects the whole patch)", () => {
    const bp = blueprint();
    const result = validateProposedPatch({
      patch: { greeting: "New greeting", notARealField: "x" },
      currentBlueprint: bp,
      maxBytes: 8192,
    });
    assert.equal(result.ok, false);
  });

  test("ALWAYS rejects a `connectors` key, even though it exists on currentBlueprint", () => {
    const bp = blueprint({ connectors: [] });
    const result = validateProposedPatch({
      patch: { connectors: [{ kind: "postiz", id: "x" }] },
      currentBlueprint: bp,
      maxBytes: 8192,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /connectors/i);
  });

  test("ALWAYS rejects a `trigger` key, even though it exists on currentBlueprint", () => {
    const bp = blueprint();
    const result = validateProposedPatch({
      patch: { trigger: { kind: "scheduled" } },
      currentBlueprint: bp,
      maxBytes: 8192,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /trigger/i);
  });

  test("rejects a patch combining an otherwise-valid key with a denied `connectors` key", () => {
    const bp = blueprint();
    const result = validateProposedPatch({
      patch: { greeting: "Hi!", connectors: [] },
      currentBlueprint: bp,
      maxBytes: 8192,
    });
    assert.equal(result.ok, false);
  });

  test("connectors/trigger denial applies even when currentBlueprint does NOT have those keys set", () => {
    const bp: AgentBlueprint = { archetype: "receptionist" };
    const result = validateProposedPatch({
      patch: { trigger: { kind: "scheduled" } },
      currentBlueprint: bp,
      maxBytes: 8192,
    });
    assert.equal(result.ok, false);
  });

  test("rejects a patch exceeding maxBytes", () => {
    const bp = blueprint();
    const bigGreeting = "x".repeat(500);
    const patch = { greeting: bigGreeting };
    const tooSmall = JSON.stringify(patch).length - 1;
    const result = validateProposedPatch({ patch, currentBlueprint: bp, maxBytes: tooSmall });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.length > 0);
  });

  test("accepts a patch exactly AT the maxBytes boundary (<=, not <)", () => {
    const bp = blueprint();
    const patch = { greeting: "hello" };
    const exact = JSON.stringify(patch).length;
    const result = validateProposedPatch({ patch, currentBlueprint: bp, maxBytes: exact });
    assert.equal(result.ok, true);
  });

  test("maxBytes is CALLER-supplied — this module does not fall back to any hard-coded default when a small maxBytes is passed", () => {
    const bp = blueprint();
    const patch = { greeting: "This greeting is definitely longer than one byte." };
    const result = validateProposedPatch({ patch, currentBlueprint: bp, maxBytes: 1 });
    assert.equal(result.ok, false);
  });

  test("field-name-agnostic: a currentBlueprint with an unforeseen extra key still allows a patch on that key (no hard-coded allowlist)", () => {
    const bp = {
      archetype: "receptionist",
      // A hypothetical FUTURE blueprint field this module has never heard of.
      futureFieldFromNextQuarter: "some value",
    } as unknown as AgentBlueprint;
    const result = validateProposedPatch({
      patch: { futureFieldFromNextQuarter: "updated value" },
      currentBlueprint: bp,
      maxBytes: 8192,
    });
    assert.equal(result.ok, true);
  });

  test("is pure: calling twice with the same input produces deep-equal output", () => {
    const bp = blueprint();
    const patch = { greeting: "Same every time" };
    const first = validateProposedPatch({ patch, currentBlueprint: bp, maxBytes: 8192 });
    const second = validateProposedPatch({ patch, currentBlueprint: bp, maxBytes: 8192 });
    assert.deepEqual(first, second);
  });

  test("does not mutate the patch or currentBlueprint inputs", () => {
    const bp = blueprint();
    const bpSnapshot = JSON.parse(JSON.stringify(bp));
    const patch = { greeting: "Untouched input" };
    const patchSnapshot = JSON.parse(JSON.stringify(patch));
    validateProposedPatch({ patch, currentBlueprint: bp, maxBytes: 8192 });
    assert.deepEqual(bp, bpSnapshot);
    assert.deepEqual(patch, patchSnapshot);
  });

  test("never throws on a deliberately hostile patch (nested junk, weird keys)", () => {
    const bp = blueprint();
    assert.doesNotThrow(() => {
      validateProposedPatch({
        patch: { greeting: { nested: { too: { deep: true } } } },
        currentBlueprint: bp,
        maxBytes: 8192,
      });
    });
  });
});

// ─── makeLlmPatchProposer ──────────────────────────────────────────────────

describe("makeLlmPatchProposer", () => {
  test("returns a valid { patch, rationale } from canned well-formed JSON", async () => {
    const canned = JSON.stringify({
      patch: { greeting: "Hi! Thanks for reaching out — how can I help?" },
      rationale: "Softened the greeting after tone-cluster failures.",
    });
    const proposer = makeLlmPatchProposer({ getClient: () => fakeClient(canned) });
    const result = await proposer({
      blueprint: blueprint(),
      clusters: [cluster()],
      lessons: ["Customers dislike an abrupt opening line."],
    });

    assert.ok(result);
    assert.deepEqual(result?.patch, { greeting: "Hi! Thanks for reaching out — how can I help?" });
    assert.equal(typeof result?.rationale, "string");
    assert.ok((result?.rationale.length ?? 0) > 0);
  });

  test("malformed (non-JSON) response fails soft to null", async () => {
    const proposer = makeLlmPatchProposer({
      getClient: () => fakeClient("Sure! Here's the patch: <not json at all>"),
    });
    const result = await proposer({
      blueprint: blueprint(),
      clusters: [cluster()],
      lessons: [],
    });
    assert.equal(result, null);
  });

  test("a non-object parsed JSON (e.g. a bare array) fails soft to null", async () => {
    const proposer = makeLlmPatchProposer({
      getClient: () => fakeClient(JSON.stringify(["patch", "rationale"])),
    });
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(result, null);
  });

  test("a well-formed JSON object missing `patch` fails soft to null", async () => {
    const proposer = makeLlmPatchProposer({
      getClient: () => fakeClient(JSON.stringify({ rationale: "no patch here" })),
    });
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(result, null);
  });

  test("a well-formed JSON object missing `rationale` fails soft to null", async () => {
    const proposer = makeLlmPatchProposer({
      getClient: () => fakeClient(JSON.stringify({ patch: { greeting: "Hi" } })),
    });
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(result, null);
  });

  test("a `patch` that is itself an array (not an object) fails soft to null", async () => {
    const proposer = makeLlmPatchProposer({
      getClient: () =>
        fakeClient(JSON.stringify({ patch: ["not", "an", "object"], rationale: "bad shape" })),
    });
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(result, null);
  });

  test("a `patch` that is null fails soft to null", async () => {
    const proposer = makeLlmPatchProposer({
      getClient: () => fakeClient(JSON.stringify({ patch: null, rationale: "bad shape" })),
    });
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(result, null);
  });

  test("client throw (network error) fails soft to null, never throws", async () => {
    const proposer = makeLlmPatchProposer({ getClient: () => throwingClient() });
    await assert.doesNotReject(
      proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] }),
    );
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(result, null);
  });

  test("never throws even when getClient itself throws", async () => {
    const proposer = makeLlmPatchProposer({
      getClient: () => {
        throw new Error("boom");
      },
    });
    await assert.doesNotReject(
      proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] }),
    );
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(result, null);
  });

  test("getClient() returning null (no key configured) fails soft to null (no network attempted)", async () => {
    const proposer = makeLlmPatchProposer({ getClient: () => null });
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(result, null);
  });

  test("CHOSEN BEHAVIOR for empty clusters: the proposer is still invoked (not short-circuited) — it calls the client and returns whatever valid patch comes back", async () => {
    let callCount = 0;
    const canned = JSON.stringify({
      patch: { greeting: "Acting on a Brain lesson with no failing clusters this run." },
      rationale: "No clusters, but a standing Brain lesson suggested a tweak.",
    });
    const countingClient = {
      messages: {
        create: async () => {
          callCount += 1;
          return { content: [{ type: "text", text: canned }] };
        },
      },
    } as unknown as import("@anthropic-ai/sdk").default;

    const proposer = makeLlmPatchProposer({ getClient: () => countingClient });
    const result = await proposer({
      blueprint: blueprint(),
      clusters: [],
      lessons: ["Always thank the customer for reaching out."],
    });

    assert.equal(callCount, 1);
    assert.ok(result);
    assert.deepEqual(result?.patch, {
      greeting: "Acting on a Brain lesson with no failing clusters this run.",
    });
  });

  test("empty clusters AND a fail-soft response together still yield null (documents that empty clusters alone isn't special-cased in the parse path)", async () => {
    const proposer = makeLlmPatchProposer({
      getClient: () => fakeClient("not json"),
    });
    const result = await proposer({ blueprint: blueprint(), clusters: [], lessons: [] });
    assert.equal(result, null);
  });

  test("is DI-only: does not touch the network beyond the injected fake (call count = 1 per invocation)", async () => {
    let callCount = 0;
    const countingClient = {
      messages: {
        create: async () => {
          callCount += 1;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ patch: { greeting: "Hi" }, rationale: "r" }),
              },
            ],
          };
        },
      },
    } as unknown as import("@anthropic-ai/sdk").default;

    const proposer = makeLlmPatchProposer({ getClient: () => countingClient });
    await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.equal(callCount, 1);
  });

  test("strips a markdown code fence around the JSON (model wrapped despite instructions)", async () => {
    const fenced = [
      "```json",
      JSON.stringify({ patch: { greeting: "Fenced hello" }, rationale: "fenced rationale" }),
      "```",
    ].join("\n");
    const proposer = makeLlmPatchProposer({ getClient: () => fakeClient(fenced) });
    const result = await proposer({ blueprint: blueprint(), clusters: [cluster()], lessons: [] });
    assert.ok(result);
    assert.deepEqual(result?.patch, { greeting: "Fenced hello" });
  });
});
