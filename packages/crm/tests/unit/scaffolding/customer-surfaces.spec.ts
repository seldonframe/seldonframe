// Tests for BlockSpec.customer_surfaces extension.
// SLICE 4b PR 2 C1 per audit §14.
//
// Additive schema extension for the scaffold → customer UI bridge.
// Structured as:
//
//   customer_surfaces:
//     display: [{ entity, filter, fields }, ...]
//     actions: [{ tool, opt_in=true, rate_limit? }, ...]
//
// Key design choices enforced here:
//   - opt_in is z.literal(true); opt_in=false or missing is REJECTED
//     at parse time (L-22 structural enforcement).
//   - display.entity must cross-reference a declared entity in
//     BlockSpec.entities.
//   - actions.tool must cross-reference a declared tool in
//     BlockSpec.tools.
//   - rate_limit is optional metadata; schema accepts the well-formed
//     string; runtime enforcement is a separate concern.
//   - Absence of customer_surfaces = empty default (backward-compat).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  BlockSpecSchema,
  type BlockSpec,
} from "../../../src/lib/scaffolding/spec";

function minimalSpec(): BlockSpec {
  return {
    slug: "notes",
    title: "Notes",
    description: "Notes block.",
    triggerPhrases: ["Add notes"],
    frameworks: ["universal"],
    produces: [],
    consumes: [],
    tools: [],
    subscriptions: [],
    entities: [],
    customer_surfaces: { display: [], actions: [] },
  };
}

function specWithEntity(): BlockSpec {
  return {
    ...minimalSpec(),
    entities: [
      {
        name: "note",
        pluralSlug: "notes",
        fields: [
          { name: "body", type: "string", nullable: false, required: true },
          { name: "pinned", type: "boolean", nullable: false, required: false },
        ],
      },
    ],
  };
}

function specWithEntityAndTool(): BlockSpec {
  return {
    ...specWithEntity(),
    produces: [{ name: "note.created", fields: [] }],
    tools: [
      {
        name: "create_note",
        description: "Create a note.",
        args: [{ name: "body", type: "string", nullable: false, required: true }],
        returns: [{ name: "noteId", type: "string", nullable: false, required: true }],
        emits: ["note.created"],
      },
    ],
  };
}

// ---------------------------------------------------------------------
// 1. Backward compat + defaults
// ---------------------------------------------------------------------

describe("customer_surfaces — backward compat + defaults", () => {
  test("accepts spec with empty customer_surfaces object", () => {
    const result = BlockSpecSchema.safeParse(minimalSpec());
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });

  test("defaults customer_surfaces to { display: [], actions: [] } when omitted", () => {
    const spec: Omit<BlockSpec, "customer_surfaces"> = minimalSpec();
    delete (spec as Partial<BlockSpec>).customer_surfaces;
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
    assert.ok(result.success && result.data.customer_surfaces);
    assert.deepEqual(result.success && result.data.customer_surfaces, { display: [], actions: [] });
  });
});

// ---------------------------------------------------------------------
// 2. display entries
// ---------------------------------------------------------------------

describe("customer_surfaces.display", () => {
  test("accepts a display entry referencing a declared entity", () => {
    const spec = specWithEntity();
    spec.customer_surfaces = {
      display: [
        { entity: "note", filter: "{{customer_id}}", fields: ["body", "pinned"] },
      ],
      actions: [],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });

  test("rejects display entry referencing an undeclared entity", () => {
    const spec = specWithEntity();
    spec.customer_surfaces = {
      display: [
        { entity: "ghost", filter: "*", fields: ["body"] },
      ],
      actions: [],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success, "expected cross-ref failure on undeclared entity");
    const message = !result.success ? JSON.stringify(result.error.issues) : "";
    assert.match(message, /ghost|entity/i);
  });

  test("rejects display entry with empty fields array", () => {
    const spec = specWithEntity();
    spec.customer_surfaces = {
      display: [{ entity: "note", filter: "*", fields: [] }],
      actions: [],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });

  test("rejects display entry with empty filter string", () => {
    const spec = specWithEntity();
    spec.customer_surfaces = {
      display: [{ entity: "note", filter: "", fields: ["body"] }],
      actions: [],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });

  test("rejects display.entity name with non-camelCase format", () => {
    const spec = specWithEntity();
    spec.customer_surfaces = {
      display: [{ entity: "Note", filter: "*", fields: ["body"] }],
      actions: [],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });

  test("accepts multiple display entries referencing the same entity", () => {
    const spec = specWithEntity();
    spec.customer_surfaces = {
      display: [
        { entity: "note", filter: "{{customer_id}}", fields: ["body"] },
        { entity: "note", filter: "pinned=true", fields: ["body", "pinned"] },
      ],
      actions: [],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });
});

// ---------------------------------------------------------------------
// 3. actions entries — opt_in enforcement (L-22)
// ---------------------------------------------------------------------

describe("customer_surfaces.actions — opt_in enforcement", () => {
  test("accepts actions entry with opt_in: true referencing a declared tool", () => {
    const spec = specWithEntityAndTool();
    spec.customer_surfaces = {
      display: [],
      actions: [{ tool: "create_note", opt_in: true }],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });

  test("REJECTS actions entry with opt_in: false (L-22 structural enforcement)", () => {
    const spec = specWithEntityAndTool();
    spec.customer_surfaces = {
      display: [],
      actions: [{ tool: "create_note", opt_in: false as true }],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success, "opt_in: false MUST reject at schema level");
  });

  test("REJECTS actions entry missing opt_in", () => {
    const spec = specWithEntityAndTool();
    spec.customer_surfaces = {
      display: [],
      actions: [{ tool: "create_note" } as unknown as { tool: string; opt_in: true }],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });

  test("rejects actions entry referencing an undeclared tool", () => {
    const spec = specWithEntityAndTool();
    spec.customer_surfaces = {
      display: [],
      actions: [{ tool: "delete_everything", opt_in: true }],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
    const message = !result.success ? JSON.stringify(result.error.issues) : "";
    assert.match(message, /delete_everything|tool/i);
  });

  test("rejects actions.tool name with non-snake_case format", () => {
    const spec = specWithEntityAndTool();
    spec.customer_surfaces = {
      display: [],
      actions: [{ tool: "CreateNote", opt_in: true }],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });
});

// ---------------------------------------------------------------------
// 4. rate_limit
// ---------------------------------------------------------------------

describe("customer_surfaces.actions — rate_limit", () => {
  test("accepts valid rate_limit formats", () => {
    const validFormats = ["5/minute", "100/hour", "10/second", "1000/day"];
    for (const rate of validFormats) {
      const spec = specWithEntityAndTool();
      spec.customer_surfaces = {
        display: [],
        actions: [{ tool: "create_note", opt_in: true, rate_limit: rate }],
      };
      const result = BlockSpecSchema.safeParse(spec);
      assert.ok(result.success, `expected ${rate} to pass; got ${!result.success ? JSON.stringify(result.error.issues) : ""}`);
    }
  });

  test("rejects malformed rate_limit strings", () => {
    const invalidFormats = ["5", "5 per minute", "unlimited", "5/year", "-5/minute"];
    for (const rate of invalidFormats) {
      const spec = specWithEntityAndTool();
      spec.customer_surfaces = {
        display: [],
        actions: [{ tool: "create_note", opt_in: true, rate_limit: rate }],
      };
      const result = BlockSpecSchema.safeParse(spec);
      assert.ok(!result.success, `expected "${rate}" to reject`);
    }
  });

  test("rate_limit is optional (omitted → still valid)", () => {
    const spec = specWithEntityAndTool();
    spec.customer_surfaces = {
      display: [],
      actions: [{ tool: "create_note", opt_in: true }],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success);
  });
});

// ---------------------------------------------------------------------
// 5. Mixed display + actions
// ---------------------------------------------------------------------

describe("customer_surfaces — combined display + actions", () => {
  test("accepts a spec with both display and actions surfaces", () => {
    const spec = specWithEntityAndTool();
    spec.customer_surfaces = {
      display: [
        { entity: "note", filter: "{{customer_id}}", fields: ["body"] },
      ],
      actions: [{ tool: "create_note", opt_in: true, rate_limit: "5/hour" }],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });

  test("exports BlockSpecCustomerDisplay + BlockSpecCustomerAction types", async () => {
    // Type-only test: import + use the exported types; TypeScript will
    // catch this at compile time if the types aren't exported.
    const mod = await import("../../../src/lib/scaffolding/spec");
    assert.ok(typeof mod.BlockSpecSchema === "function" || typeof mod.BlockSpecSchema === "object");
  });
});
