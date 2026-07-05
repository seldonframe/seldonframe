// Unit tests for lib/activation/ladder-server.ts — Task 6 of the win-ladder +
// SeldonChat plan. All DB/Composio/PostHog dependencies are injected so this
// spec never touches a real database or network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveLadderInputs,
  stampLadderEvent,
  markShareUsed,
  buildStampStepPatch,
  buildStampShareUsedPatch,
  type LadderServerDeps,
} from "../../../src/lib/activation/ladder-server";

/**
 * Flatten a drizzle `sql\`...\`` query into its literal string/param pieces,
 * skipping opaque column/table references (e.g. PgJsonb column objects),
 * which don't carry driver-relevant text of their own. Lets specs assert on
 * the actual SQL text + bound param VALUES without hitting a real DB —
 * exactly the class of bug (NeonDbError 42P18: "could not determine data
 * type of parameter $1") that broke this file's two jsonb writers in prod.
 */
function flattenSqlChunks(query: { queryChunks: unknown[] }): string[] {
  return query.queryChunks
    .map((chunk) => {
      if (Array.isArray(chunk)) return chunk.join("");
      if (typeof chunk === "string") return chunk;
      if (chunk && typeof chunk === "object" && "value" in (chunk as Record<string, unknown>)) {
        const value = (chunk as { value: unknown }).value;
        return Array.isArray(value) ? value.join("") : String(value);
      }
      // Column/table reference (e.g. organizations.settings) — opaque here.
      return null;
    })
    .filter((piece): piece is string => piece !== null);
}

function deps(overrides: Partial<LadderServerDeps> = {}): LadderServerDeps {
  return {
    hasBooking: async () => false,
    landingVersionCount: async () => 0,
    calendarConnected: async () => false,
    copilotEverUsed: async () => false,
    readActivationSettings: async () => ({ domainAttached: false, shareUsed: false }),
    extraAgentCount: async () => 0,
    ...overrides,
  };
}

describe("resolveLadderInputs", () => {
  test("maps dep results onto the LadderInputs shape", async () => {
    const inputs = await resolveLadderInputs(
      "org_1",
      deps({
        hasBooking: async () => true,
        landingVersionCount: async () => 2,
        calendarConnected: async () => true,
        copilotEverUsed: async () => true,
        readActivationSettings: async () => ({ domainAttached: true, shareUsed: true }),
        extraAgentCount: async () => 3,
      }),
    );

    assert.deepEqual(inputs, {
      hasBooking: true,
      calendarConnected: true,
      landingVersionCount: 2,
      copilotEverUsed: true,
      domainAttached: true,
      shareUsed: true,
      extraAgentCount: 3,
    });
  });

  test("all-false/zero deps map to all-false/zero inputs", async () => {
    const inputs = await resolveLadderInputs("org_2", deps());
    assert.deepEqual(inputs, {
      hasBooking: false,
      calendarConnected: false,
      landingVersionCount: 0,
      copilotEverUsed: false,
      domainAttached: false,
      shareUsed: false,
      extraAgentCount: 0,
    });
  });

  test("calendarConnected resolves false when the dep throws (fail-soft)", async () => {
    const inputs = await resolveLadderInputs(
      "org_3",
      deps({
        calendarConnected: async () => {
          throw new Error("composio unreachable");
        },
      }),
    );
    assert.equal(inputs.calendarConnected, false);
  });

  test("landingVersionCount passes the raw count through (not clamped to boolean)", async () => {
    const inputs = await resolveLadderInputs("org_4", deps({ landingVersionCount: async () => 1 }));
    assert.equal(inputs.landingVersionCount, 1);
  });

  test("extraAgentCount reflects the templates dep (Task 10 starter agents write agentTemplates, not `agents`)", async () => {
    // The reviewer's CRITICAL fix: defaultExtraAgentCount now also counts the
    // org's agentTemplates rows with an event trigger, since enableStarterAgentAction
    // (agent-picks-actions.ts) creates ONLY agent_templates rows. This spec
    // asserts resolveLadderInputs faithfully passes that combined count through —
    // a DI case standing in for "the templates dep returns 1".
    const inputs = await resolveLadderInputs("org_5", deps({ extraAgentCount: async () => 1 }));
    assert.equal(inputs.extraAgentCount, 1);
  });
});

describe("stampLadderEvent", () => {
  test("stamps + captures exactly once when the step was previously absent", async () => {
    let stamped: string | null = null;
    const captured: Array<{ event: string; distinctId: string; properties?: Record<string, unknown> }> = [];

    await stampLadderEvent("org_5", "test_booking", {
      wasStepStamped: async () => false,
      stampStep: async (_orgId, step) => {
        stamped = step;
      },
      captureEvent: (input) => {
        captured.push(input);
      },
    });

    assert.equal(stamped, "test_booking");
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], {
      event: "activation_step_completed",
      distinctId: "org_5",
      properties: { step: "test_booking" },
    });
  });

  test("is a no-op (no write, no capture) when the step was already stamped", async () => {
    let stampCalls = 0;
    let captureCalls = 0;

    await stampLadderEvent("org_6", "go_live", {
      wasStepStamped: async () => true,
      stampStep: async () => {
        stampCalls += 1;
      },
      captureEvent: () => {
        captureCalls += 1;
      },
    });

    assert.equal(stampCalls, 0);
    assert.equal(captureCalls, 0);
  });
});

describe("buildStampStepPatch / buildStampShareUsedPatch (Neon 42P18 regression)", () => {
  // Prod error (Vercel logs, verbatim):
  //   NeonDbError: could not determine data type of parameter $1  (code 42P18)
  //   at Object.stampShareUsed
  // Root cause: jsonb_build_object($1, $2::text) — $1 (the KEY) had no cast,
  // so the Neon HTTP driver couldn't infer its type. This fired for BOTH
  // stampStep (activation.<step>At) and stampShareUsed (activation.shareUsedAt)
  // — same idiom, same latent bug — but stampLadderEvent's caller swallows
  // the error (fire-and-forget in the dashboard render loop), so it failed
  // completely silently: no activation stamps, no funnel events, ever.
  //
  // Fix: build the nested patch object in JS and bind it as ONE ::jsonb
  // parameter (the mark-operator-onboarded.ts:80 idiom), so the driver never
  // has to infer a type for a bare jsonb_build_object key param.

  test("buildStampStepPatch casts the JSON patch param to ::jsonb", () => {
    const query = buildStampStepPatch("test_booking" as never, "2026-01-01T00:00:00.000Z");
    const pieces = flattenSqlChunks(query);
    const sqlText = pieces.join("");

    assert.match(sqlText, /\}::jsonb\)/, "the patch param must be immediately followed by ::jsonb");
    assert.ok(
      pieces.some((p) => p === JSON.stringify({ test_bookingAt: "2026-01-01T00:00:00.000Z" })),
      "the bound param must be the JSON-encoded { [step + 'At']: iso } patch object",
    );
  });

  test("buildStampStepPatch never emits an uncast jsonb_build_object(<param> key", () => {
    const query = buildStampStepPatch("go_live" as never, "2026-01-01T00:00:00.000Z");
    const sqlText = flattenSqlChunks(query).join("");

    // The prod bug's exact shape: jsonb_build_object( immediately followed by
    // a bound param with no preceding literal key and no trailing ::cast.
    // After the fix, jsonb_build_object( is only ever followed by a quoted
    // literal key ('activation') — the dynamic value is merged in via ||
    // <jsonb-param> instead of as a jsonb_build_object argument.
    assert.doesNotMatch(sqlText, /jsonb_build_object\(\s*"/, "no jsonb_build_object call may take a bound param as its first (key) argument");
  });

  test("buildStampShareUsedPatch casts the JSON patch param to ::jsonb", () => {
    const query = buildStampShareUsedPatch("2026-02-02T00:00:00.000Z");
    const pieces = flattenSqlChunks(query);
    const sqlText = pieces.join("");

    assert.match(sqlText, /\}::jsonb\)/, "the patch param must be immediately followed by ::jsonb");
    assert.ok(
      pieces.some((p) => p === JSON.stringify({ shareUsedAt: "2026-02-02T00:00:00.000Z" })),
      "the bound param must be the JSON-encoded { shareUsedAt: iso } patch object",
    );
  });

  test("buildStampShareUsedPatch never emits an uncast jsonb_build_object(<param> key", () => {
    const query = buildStampShareUsedPatch("2026-02-02T00:00:00.000Z");
    const sqlText = flattenSqlChunks(query).join("");

    assert.doesNotMatch(sqlText, /jsonb_build_object\(\s*"/, "no jsonb_build_object call may take a bound param as its first (key) argument");
  });

  test("both patches preserve the nested activation merge (COALESCE against settings->'activation')", () => {
    // Regression guard for the "don't clobber sibling activation.* keys"
    // requirement — the fix must keep merging into the nested object, not
    // replace it outright.
    const stepSql = flattenSqlChunks(buildStampStepPatch("hire_agent" as never, "2026-01-01T00:00:00.000Z")).join("");
    const shareSql = flattenSqlChunks(buildStampShareUsedPatch("2026-01-01T00:00:00.000Z")).join("");

    for (const sqlText of [stepSql, shareSql]) {
      assert.match(sqlText, /jsonb_build_object\('activation',/);
      assert.match(sqlText, /->'activation'/);
    }
  });
});

describe("markShareUsed", () => {
  test("writes settings.activation.shareUsedAt only when absent, and never captures", async () => {
    let stampCalls = 0;
    let stamped = false;

    await markShareUsed("org_7", {
      wasShareUsedStamped: async () => stamped,
      stampShareUsed: async () => {
        stampCalls += 1;
        stamped = true;
      },
    });
    assert.equal(stampCalls, 1);

    await markShareUsed("org_7", {
      wasShareUsedStamped: async () => stamped,
      stampShareUsed: async () => {
        stampCalls += 1;
      },
    });
    assert.equal(stampCalls, 1);
  });
});
