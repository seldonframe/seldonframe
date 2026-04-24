// End-to-end smoke test for the scaffold → customer UI bridge.
// SLICE 4b PR 2 C3 per audit §14.
//
// Mirrors admin-bridge-smoke.spec.tsx: scaffold a block with both
// an entity AND customer_surfaces into a repo-local path, dynamic-
// import the generated customer view + form modules via tsx's
// loader, and assert they loaded cleanly.
//
// This proves:
//   1. Generated customer view/form TypeScript is syntactically valid
//   2. Imports (@/components/ui-customer/*, ../admin/<entity>.schema,
//      zod) resolve at runtime
//   3. Both modules default-export React components
//   4. The sibling admin schema emission is compatible with the
//      customer view's import path

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { scaffoldBlock } from "../../../src/lib/scaffolding/orchestrator";
import type { BlockSpec } from "../../../src/lib/scaffolding/spec";

const SMOKE_DIR = path.resolve(
  process.cwd(),
  "tests",
  "_customer-bridge-smoke",
);
const SMOKE_SLUG = "customer-smoke";

function smokeSpec(): BlockSpec {
  return {
    slug: SMOKE_SLUG,
    title: "Customer Smoke",
    description: "End-to-end smoke block for the SLICE 4b customer bridge.",
    triggerPhrases: ["Install customer smoke"],
    frameworks: ["universal"],
    produces: [{ name: "smoke.created", fields: [] }],
    consumes: [],
    tools: [
      {
        name: "create_smoke",
        description: "Create a smoke entry.",
        args: [
          { name: "body", type: "string", nullable: false, required: true },
          { name: "priority", type: "integer", nullable: false, required: false },
        ],
        returns: [{ name: "smokeId", type: "string", nullable: false, required: true }],
        emits: ["smoke.created"],
      },
    ],
    subscriptions: [],
    entities: [
      {
        name: "smoke",
        pluralSlug: "smokes",
        fields: [
          { name: "body", type: "string", nullable: false, required: true },
          { name: "pinned", type: "boolean", nullable: false, required: false },
        ],
      },
    ],
    customer_surfaces: {
      display: [
        { entity: "smoke", filter: "{{customer_id}}", fields: ["body", "pinned"] },
      ],
      actions: [
        { tool: "create_smoke", opt_in: true, rate_limit: "3/minute" },
      ],
    },
  };
}

function cleanSmokeDir() {
  if (existsSync(SMOKE_DIR)) {
    rmSync(SMOKE_DIR, { recursive: true, force: true });
  }
}

describe("scaffold → customer UI bridge — end-to-end smoke", () => {
  before(() => {
    cleanSmokeDir();
    mkdirSync(SMOKE_DIR, { recursive: true });
  });

  after(() => {
    cleanSmokeDir();
  });

  test("scaffolded customer view + action form modules load via tsx loader", async () => {
    const blocksDir = path.join(SMOKE_DIR, "blocks");
    const testsDir = path.join(SMOKE_DIR, "tests");

    const result = await scaffoldBlock({
      spec: smokeSpec(),
      blocksDir,
      testsDir,
      validate: async () => undefined,
    });

    const viewPath = result.created.find((p) => p.endsWith(".view.tsx"));
    const formPath = result.created.find((p) => p.endsWith(".form.tsx"));
    const schemaPath = result.created.find((p) => p.endsWith(".schema.ts"));
    assert.ok(viewPath, "expected customer view file");
    assert.ok(formPath, "expected customer form file");
    assert.ok(schemaPath, "expected admin schema (sibling) file");

    // Dynamic-import each module — fails if generated TS is invalid or
    // if imports don't resolve.
    const viewModule = await import(pathToFileURL(viewPath!).href);
    assert.equal(
      typeof viewModule.default,
      "function",
      "customer view must default-export a function",
    );

    const formModule = await import(pathToFileURL(formPath!).href);
    assert.equal(
      typeof formModule.default,
      "function",
      "customer action form must default-export a function",
    );

    // Sibling schema module resolves too — confirms the view's
    // "../admin/<entity>.schema" import path lines up with the
    // admin-bridge emission location.
    const schemaModule = await import(pathToFileURL(schemaPath!).href);
    assert.ok(schemaModule.SmokeSchema, "admin schema must export SmokeSchema");
  });
});
