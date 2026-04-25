// Scaffold validation gate.
//
// Shipped in SLICE 2 PR 1 Commit 5 per audit §5 + G-5 resolution:
// parser round-trip + tsc --noEmit + emit:blocks:check. No test runs
// in scaffold validation (pretend-passes against empty handler
// bodies are meaningless and slow the demo moment).
//
// The gate is an ordered list of checks. Each check gets the full
// created-files list and decides which files it cares about (the
// parser check looks for `.block.md`; tsc check runs against the
// whole tree; emit:blocks:check is global). On first failure, the
// gate annotates with the failing step name and rethrows — the
// writer's ScaffoldError (§10) catches that, attaches the orphan
// list, and surfaces to the caller.
//
// Non-pure checks (tsc + emit) spawn child processes. They're
// covered end-to-end by the smoke-test block run in C7 rather than
// unit tests here — spawning pnpm in a unit test is flaky + slow +
// doesn't test much beyond "the command line string is right".

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseBlockMd } from "../blocks/block-md";

export type ValidationCheck = {
  name: string;
  run: (createdFiles: string[]) => Promise<void>;
};

export type ValidationGate = {
  run: (createdFiles: string[]) => Promise<void>;
};

export function createValidationGate(checks: ValidationCheck[]): ValidationGate {
  return {
    async run(createdFiles) {
      for (const check of checks) {
        try {
          await check.run(createdFiles);
        } catch (err) {
          const inner = err instanceof Error ? err.message : String(err);
          throw new Error(`validation step "${check.name}" failed: ${inner}`);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------
// parserCheck — parseBlockMd round-trip on every .block.md we wrote
// ---------------------------------------------------------------------

export function parserCheck(): ValidationCheck {
  return {
    name: "parseBlockMd",
    async run(files) {
      const blockMdFiles = files.filter((p) => p.endsWith(".block.md"));
      for (const filePath of blockMdFiles) {
        const content = readFileSync(filePath, "utf8");
        const parsed = parseBlockMd(content);
        if (parsed.composition.mixedShapeFields.includes("__tools_malformed__")) {
          throw new Error(`${filePath}: __tools_malformed__ — TOOLS marker block doesn't parse as valid JSON`);
        }
        if (parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__")) {
          throw new Error(`${filePath}: __subscriptions_malformed__ — SUBSCRIPTIONS marker block doesn't parse as valid JSON`);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------
// tscCheck — `tsc --noEmit` against the CRM package
// ---------------------------------------------------------------------

export function tscCheck(cwd: string): ValidationCheck {
  return {
    name: "tsc",
    async run() {
      await spawnAndWait(
        "npx",
        ["tsc", "--noEmit"],
        { cwd },
        "tsc --noEmit",
      );
    },
  };
}

// ---------------------------------------------------------------------
// emitBlocksCheck — `pnpm emit:blocks:check`
// ---------------------------------------------------------------------

export function emitBlocksCheck(repoRoot: string): ValidationCheck {
  return {
    name: "emit:blocks:check",
    async run() {
      await spawnAndWait(
        "pnpm",
        ["emit:blocks:check"],
        { cwd: repoRoot },
        "pnpm emit:blocks:check",
      );
    },
  };
}

// ---------------------------------------------------------------------
// Shared: spawn + wait for exit, throwing on non-zero exit code.
// ---------------------------------------------------------------------

function spawnAndWait(
  command: string,
  args: string[],
  options: { cwd: string },
  label: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += String(d); });
    child.stderr?.on("data", (d) => { stderr += String(d); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(
        `${label} failed with exit code ${code}\n` +
        `stdout:\n${stdout.slice(-2000)}\n` +
        `stderr:\n${stderr.slice(-2000)}`,
      ));
    });
  });
}

// ---------------------------------------------------------------------
// Default gate — the combination PR 1 ships with, per G-5 resolution.
// ---------------------------------------------------------------------

export function defaultValidationGate(cwd: string, repoRoot: string): ValidationGate {
  return createValidationGate([
    parserCheck(),
    tscCheck(cwd),
    emitBlocksCheck(repoRoot),
  ]);
}

// Re-export path for helpers that need path utilities alongside the gate.
export { path };
