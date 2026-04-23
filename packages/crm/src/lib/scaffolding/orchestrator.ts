// scaffoldBlock — the one callable entry point the
// `skills/block-creation/` SKILL invokes (via the CLI wrapper in
// `scripts/scaffold-block.ts`).
//
// Shipped in SLICE 2 PR 1 Commit 6. Composes the upstream commits:
//   C1: BlockSpecSchema    — validates the input
//   C2: renderBlockMd + renderToolsTs — main file renderers
//   C3: renderHandlerStub + renderTestStub — stub renderers
//   C4: executeScaffold    — file writer + orphan detection
//   C5: validation gate    — parser + tsc + emit:blocks:check
//
// Flow:
//   1. BlockSpecSchema.parse(spec) — throws on any validation
//      issue. No files touched.
//   2. Render the file plan (paths + content for each file).
//   3. executeScaffold(plan, validate):
//      - Precheck: refuse if any target path already exists.
//      - Write all files.
//      - Run the validation gate.
//      - On validate failure: orphan report with recovery options.

import path from "node:path";

import { BlockSpecSchema, type BlockSpec } from "./spec";
import { renderBlockMd } from "./render/block-md";
import { renderToolsTs } from "./render/tools-ts";
import { renderHandlerStub } from "./render/handler-stub";
import { renderTestStub } from "./render/test-stub";
import { executeScaffold, type ScaffoldFileWrite } from "./writer";

export type ScaffoldBlockInput = {
  /** Unvalidated BlockSpec — the orchestrator runs BlockSpecSchema.parse. */
  spec: unknown;
  /** Absolute path to the blocks directory (e.g., .../packages/crm/src/blocks). */
  blocksDir: string;
  /** Absolute path to the tests directory for block specs (e.g., .../packages/crm/tests/unit/blocks). */
  testsDir: string;
  /**
   * Validation callback invoked after files land. Thrown errors
   * trigger the orphan report. Typical value: the
   * defaultValidationGate from lib/scaffolding/validate.ts.
   * Tests pass an async no-op.
   */
  validate: (createdFiles: string[]) => Promise<void>;
  /** When true, skip writes + validate; return what would land. */
  dryRun?: boolean;
};

export type ScaffoldBlockResult = {
  created: string[];
  dryRun?: boolean;
};

export async function scaffoldBlock(
  input: ScaffoldBlockInput,
): Promise<ScaffoldBlockResult> {
  // 1. Validate the input BlockSpec. Any error halts before any
  // file system touch.
  const parseResult = BlockSpecSchema.safeParse(input.spec);
  if (!parseResult.success) {
    const msg = parseResult.error.issues
      .map((i) => `  - ${i.path.join(".") || "$"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `[scaffold] BlockSpec validation failed. ${parseResult.error.issues.length} issue(s):\n${msg}`,
    );
  }
  const spec: BlockSpec = parseResult.data;

  // 2. Render the file plan.
  const plan = buildFilePlan(spec, input.blocksDir, input.testsDir);

  // 3. Execute — precheck, write, validate, orphan-report on
  // failure.
  const result = await executeScaffold({
    files: plan,
    validate: input.validate,
    dryRun: input.dryRun,
  });

  return result;
}

// ---------------------------------------------------------------------
// File-plan builder
// ---------------------------------------------------------------------

function buildFilePlan(
  spec: BlockSpec,
  blocksDir: string,
  testsDir: string,
): ScaffoldFileWrite[] {
  const plan: ScaffoldFileWrite[] = [];

  // BLOCK.md
  plan.push({
    path: path.join(blocksDir, `${spec.slug}.block.md`),
    content: renderBlockMd(spec),
  });

  // tools.ts
  plan.push({
    path: path.join(blocksDir, `${spec.slug}.tools.ts`),
    content: renderToolsTs(spec),
  });

  // subscriptions/*.ts — one file per declared subscription.
  for (const sub of spec.subscriptions) {
    plan.push({
      path: path.join(blocksDir, spec.slug, "subscriptions", `${sub.handlerName}.ts`),
      content: renderHandlerStub(sub),
    });
  }

  // Test stub.
  plan.push({
    path: path.join(testsDir, `${spec.slug}.spec.ts`),
    content: renderTestStub(spec),
  });

  return plan;
}
