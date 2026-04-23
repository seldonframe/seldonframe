// TypeScript implementation for the emit-block-tools CLI. Invoked by
// scripts/emit-block-tools.js under `node --import tsx`.
//
// Pure orchestration over lib/blocks/emit-tools.ts. Intentionally thin
// so the logic under test lives in the importable module, not here.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CRM_TOOLS } from "../packages/crm/src/blocks/crm.tools";
import { BOOKING_TOOLS } from "../packages/crm/src/blocks/caldiy-booking.tools";
import { EMAIL_TOOLS } from "../packages/crm/src/blocks/email.tools";
import { SMS_TOOLS } from "../packages/crm/src/blocks/sms.tools";
import { PAYMENTS_TOOLS } from "../packages/crm/src/blocks/payments.tools";
import { INTAKE_TOOLS } from "../packages/crm/src/blocks/intake.tools";
import { LANDING_TOOLS } from "../packages/crm/src/blocks/landing.tools";
import { NOTES_TOOLS } from "../packages/crm/src/blocks/notes.tools";
import {
  applyToolsToMarkdown,
  emitToolEntries,
  TOOLS_START_MARKER,
} from "../packages/crm/src/lib/blocks/emit-tools";
import type { ToolDefinition } from "../packages/crm/src/lib/blocks/contract-v2";

const checkMode = process.argv.includes("--check");
const repoRoot = path.resolve(__dirname, "..");
const blocksDir = path.join(repoRoot, "packages/crm/src/blocks");

interface BlockEmitTarget {
  slug: string;
  tools: readonly ToolDefinition[];
}

// Registry of blocks whose tools emit to BLOCK.md. 2b.2 COMPLETE —
// all 7 core blocks migrated to v2.
const TARGETS: BlockEmitTarget[] = [
  { slug: "crm", tools: CRM_TOOLS },
  { slug: "caldiy-booking", tools: BOOKING_TOOLS },
  { slug: "email", tools: EMAIL_TOOLS },
  { slug: "sms", tools: SMS_TOOLS },
  { slug: "payments", tools: PAYMENTS_TOOLS },
  { slug: "formbricks-intake", tools: INTAKE_TOOLS },
  { slug: "landing-pages", tools: LANDING_TOOLS },
  { slug: "notes", tools: NOTES_TOOLS },
];

let driftDetected = false;
let updateCount = 0;

for (const target of TARGETS) {
  const blockPath = path.join(blocksDir, `${target.slug}.block.md`);
  const content = readFileSync(blockPath, "utf8");

  if (!content.includes(TOOLS_START_MARKER)) {
    // No markers in this BLOCK.md yet — the block hasn't migrated to v2.
    // Emit is a no-op; PR 3 will add CRM's markers.
    console.log(`[skip] ${target.slug}: BLOCK.md has no <!-- TOOLS:START --> marker yet`);
    continue;
  }

  const entries = emitToolEntries(target.tools);
  const result = applyToolsToMarkdown(content, entries);
  if (!result.applied) {
    // Start marker present but the shape is malformed (e.g., missing END).
    console.error(`[error] ${target.slug}: TOOLS start marker present but end marker missing or out of order`);
    process.exit(1);
  }

  if (result.content === content) {
    console.log(`[clean] ${target.slug}: emit matches committed BLOCK.md`);
    continue;
  }

  if (checkMode) {
    console.error(`[drift] ${target.slug}: committed BLOCK.md does not match emit output`);
    console.error(`  Run \`pnpm emit:blocks\` to regenerate, then commit the result.`);
    driftDetected = true;
  } else {
    writeFileSync(blockPath, result.content);
    updateCount += 1;
    console.log(`[update] ${target.slug}: rewrote TOOLS block`);
  }
}

if (checkMode) {
  if (driftDetected) {
    console.error("\nDrift detected. Fail.");
    process.exit(1);
  }
  console.log("\nNo drift. All emitted BLOCK.md files match committed state.");
  process.exit(0);
}

console.log(`\nDone. ${updateCount} block(s) updated.`);
