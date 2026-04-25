// Scaffold file writer + orphan detection.
//
// Shipped in SLICE 2 PR 1 Commit 4 per audit §10.
//
// Contract:
//   1. Precheck — every target path must NOT exist. If any exists,
//      halt BEFORE writing anything (no orphans).
//   2. Write — each file lands in order; intermediate dirs created
//      as needed via fs.mkdir({ recursive: true }).
//   3. Validate — caller-provided async function (e.g., parser +
//      tsc + emit:blocks:check in the full pipeline). Throwing
//      here triggers the orphan report; files stay on disk for
//      the builder to review + git-clean.
//   4. Error messages include the full created-files list and
//      concrete recovery commands.
//
// Why not transactional rollback: per audit §9 ("block scaffolding
// is a code-authoring workflow"), git is the transactional
// envelope. Auto-deletion of partial output hides failure detail
// from the builder and adds complexity (temp-dir + atomic rename
// vs journaling) for a scenario git already handles. Orphan
// detection is loud, clear, recoverable.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ScaffoldFileWrite = {
  /** Absolute or CWD-relative path. */
  path: string;
  content: string;
};

export type ScaffoldStep = "precheck" | "write" | "validate";

export type ExecuteScaffoldInput = {
  files: ScaffoldFileWrite[];
  /**
   * Called after every file lands on disk. Throwing triggers
   * the orphan report. Return void on success.
   */
  validate: (createdFiles: string[]) => Promise<void>;
  /**
   * When true, skip writing + skip validate; return the created
   * list as if we'd written. Useful for "show me what this would
   * do" previews.
   */
  dryRun?: boolean;
};

export type ExecuteScaffoldResult = {
  created: string[];
  dryRun?: boolean;
};

export class ScaffoldError extends Error {
  readonly name = "ScaffoldError";
  readonly step: ScaffoldStep;
  readonly createdFiles: string[];
  readonly cause?: unknown;

  constructor(input: {
    step: ScaffoldStep;
    createdFiles: string[];
    cause?: unknown;
    messageOverride?: string;
  }) {
    const causeMessage = input.cause instanceof Error ? input.cause.message : String(input.cause ?? "");
    const header =
      input.messageOverride ??
      `[scaffold] FAILED at step: ${input.step}\n` +
        `Error: ${causeMessage}`;

    const filesBlock =
      input.createdFiles.length > 0
        ? `\n\nFiles created by this run (orphans if validation failed):\n` +
          input.createdFiles.map((p) => `  ${p}`).join("\n") +
          `\n\nRecovery options:\n` +
          `  1. Fix the issue and re-run the scaffold. It will refuse to\n` +
          `     overwrite the orphans; remove them first (see option 2).\n` +
          `  2. Remove the orphans:\n` +
          `     git clean -fd ${uniqueParents(input.createdFiles).join(" ")}\n` +
          `  3. Review manually and hand-fix — diff shows what landed.`
        : "";

    super(header + filesBlock);
    this.step = input.step;
    this.createdFiles = input.createdFiles;
    this.cause = input.cause;
  }
}

export async function executeScaffold(
  input: ExecuteScaffoldInput,
): Promise<ExecuteScaffoldResult> {
  const { files, validate, dryRun } = input;

  // Dry-run short-circuit — no disk touches, no validate.
  if (dryRun) {
    return { created: files.map((f) => f.path), dryRun: true };
  }

  // 1. Precheck: refuse to overwrite existing files.
  const alreadyExist = files.filter((f) => existsSync(f.path));
  if (alreadyExist.length > 0) {
    throw new ScaffoldError({
      step: "precheck",
      createdFiles: [],
      messageOverride:
        `[scaffold] FAILED at step: precheck\n` +
        `Error: target path already exists and will not be overwritten:\n` +
        alreadyExist.map((f) => `  ${f.path}`).join("\n") +
        `\n\nThe scaffold refuses to overwrite existing code. Remove the\n` +
        `conflicting files (or pick a different block slug) and re-run.`,
    });
  }

  // 2. Write — create parent dirs as needed.
  const created: string[] = [];
  for (const f of files) {
    const parent = path.dirname(f.path);
    mkdirSync(parent, { recursive: true });
    writeFileSync(f.path, f.content);
    created.push(f.path);
  }

  // 3. Validate — throw if caller-provided check fails.
  try {
    await validate(created);
  } catch (err) {
    throw new ScaffoldError({
      step: "validate",
      createdFiles: created,
      cause: err,
    });
  }

  return { created };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function uniqueParents(paths: string[]): string[] {
  const parents = new Set(paths.map((p) => path.dirname(p)));
  // Deduplicate nested parents: keep only top-level unique roots
  // for the git-clean command example. (Good enough for a hint;
  // the builder's own git clean will be path-specific.)
  return Array.from(parents).sort();
}
