import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

// ─── v1.5.0 — block codegen staleness check ────────────────────────────────
//
// This test exists to enforce the codegen contract: editing a SKILL.md
// without re-running `pnpm blocks:emit` is a build failure. Without this
// gate the prop-schema drift bug class (which v1.5 just structurally
// killed) would silently re-emerge whenever someone edits a frontmatter
// and forgets the regeneration step.
//
// `pnpm blocks:emit:check` re-runs the emitter in --check mode. It exits
// 0 when every __generated__/block.ts matches what the current SKILL.md
// frontmatters would produce, and exits non-zero (with a diff message)
// otherwise.

test("block __generated__/ files are not stale relative to SKILL.md frontmatter", () => {
  const cwd = resolve(__dirname, "..", "..");
  try {
    execSync("pnpm blocks:emit:check", { cwd, stdio: "pipe" });
  } catch (err) {
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? (err as { stdout?: Buffer }).stdout?.toString() ?? ""
        : "";
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? (err as { stderr?: Buffer }).stderr?.toString() ?? ""
        : "";
    assert.fail(
      `Block codegen is stale. Run \`pnpm blocks:emit\` and commit the diff.\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
    );
  }
});
