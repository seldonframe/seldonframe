// CLI wrapper for scaffoldBlock. Invoked by the block-creation
// skill (skills/block-creation/SKILL.md) via:
//
//   pnpm scaffold:block --spec <spec.json>
//   pnpm scaffold:block --spec <spec.json> --dry-run
//   pnpm scaffold:block --spec <spec.json> --edit-events-union
//
// Reads BlockSpec JSON from a file path, runs the orchestrator,
// optionally patches the SeldonEvent union with any new produces
// events (AST-located splice per G-2), and prints either a success
// report or an error with recovery options.
//
// Exit codes:
//   0 — success
//   1 — BlockSpec validation failure (no files touched)
//   2 — validation gate failure (orphan report printed)
//   3 — unexpected error
//   4 — AST event-union edit failure (fallback-warning also surfaced)

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { scaffoldBlock } from "../packages/crm/src/lib/scaffolding/orchestrator";
import { defaultValidationGate } from "../packages/crm/src/lib/scaffolding/validate";
import { addEventsToSeldonUnion } from "../packages/crm/src/lib/scaffolding/ast-event-union";
import { BlockSpecSchema } from "../packages/crm/src/lib/scaffolding/spec";

const repoRoot = path.resolve(__dirname, "..");
const crmPackage = path.join(repoRoot, "packages/crm");
const blocksDir = path.join(crmPackage, "src/blocks");
const testsDir = path.join(crmPackage, "tests/unit/blocks");

function usage(): never {
  process.stderr.write(
    "Usage: pnpm scaffold:block --spec <spec.json> [--dry-run] [--skip-validation] [--edit-events-union]\n",
  );
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let specPath: string | null = null;
  let dryRun = false;
  let skipValidation = false;
  let editEventsUnion = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--spec") specPath = args[++i] ?? null;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--skip-validation") skipValidation = true;
    else if (arg === "--edit-events-union") editEventsUnion = true;
    else usage();
  }
  if (!specPath) usage();
  return { specPath: specPath!, dryRun, skipValidation, editEventsUnion };
}

async function main() {
  const { specPath, dryRun, skipValidation, editEventsUnion } = parseArgs();

  let spec: unknown;
  try {
    const raw = readFileSync(specPath, "utf8");
    spec = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(
      `Failed to read/parse spec file "${specPath}": ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
    process.exit(1);
  }

  const validate = skipValidation || dryRun
    ? async () => {}
    : defaultValidationGate(crmPackage, repoRoot).run;

  try {
    const result = await scaffoldBlock({
      spec,
      blocksDir,
      testsDir,
      validate,
      dryRun,
    });

    if (result.dryRun) {
      process.stdout.write("[scaffold] DRY RUN — would create:\n");
    } else {
      process.stdout.write("[scaffold] Success. Files created:\n");
    }
    for (const p of result.created) {
      process.stdout.write(`  ${path.relative(repoRoot, p)}\n`);
    }

    // Optional: edit the SeldonEvent union with the spec's new
    // produces events. Runs AFTER scaffold succeeds; orchestrator
    // already validated the spec, so skipping re-parse.
    if (!result.dryRun && editEventsUnion) {
      const eventsFile = path.join(repoRoot, "packages/core/src/events/index.ts");
      try {
        const parsedSpec = BlockSpecSchema.parse(spec);
        const source = readFileSync(eventsFile, "utf8");
        const editResult = addEventsToSeldonUnion(source, parsedSpec);
        if (editResult.added.length > 0) {
          writeFileSync(eventsFile, editResult.source);
          process.stdout.write(
            `\n[events-union] ${editResult.astPath ? "AST" : "fallback"} edit: added ${editResult.added.length} event(s): ${editResult.added.join(", ")}\n`,
          );
          if (!editResult.astPath) {
            process.stdout.write(
              "[events-union] WARNING — fallback path was used. Review the edit manually via `git diff packages/core/src/events/index.ts`.\n",
            );
          }
        } else {
          process.stdout.write(
            `\n[events-union] no new events to add (already present in union)\n`,
          );
        }
      } catch (err) {
        process.stderr.write(
          `\n[events-union] FAILED to edit ${eventsFile}: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
        process.exit(4);
      }
    }

    if (!result.dryRun) {
      process.stdout.write("\nNext steps:\n");
      process.stdout.write(
        "  1. Review the generated files + fill in TODO (scaffold-default) markers.\n",
      );
      process.stdout.write(
        "  2. Run `pnpm emit:blocks` to populate the TOOLS block in the BLOCK.md.\n",
      );
      process.stdout.write(
        "  3. Add the block to scripts/emit-block-tools.impl.ts TARGETS to keep it emit-checked.\n",
      );
      process.stdout.write(
        "  4. Run `pnpm test:unit` to verify the test stubs show up as todos.\n",
      );
      process.stdout.write(
        "  5. git diff / git add / git commit when you're satisfied.\n",
      );
    }

    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // BlockSpec validation failures land before any write; they
    // carry "BlockSpec validation failed" in the message.
    if (msg.startsWith("[scaffold] BlockSpec validation failed")) {
      process.stderr.write(msg + "\n");
      process.exit(1);
    }
    // Validation-gate failures come through wrapped by ScaffoldError
    // and carry "FAILED at step:" + the orphan recovery block.
    process.stderr.write(msg + "\n");
    process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(
    `[scaffold] unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(3);
});
