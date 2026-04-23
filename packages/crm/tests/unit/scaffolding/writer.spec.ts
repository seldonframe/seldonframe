// Tests for the scaffold file writer + orphan detection. PR 1 C4
// per audit §10 — orphan detection, not transactional rollback.
//
// Strategy: use os.tmpdir() as the scratch dir. Writes land for
// real; each test cleans up after itself. Verifies:
//   - Happy path: all files land as requested.
//   - Pre-existing file → refuse to write ANY file (halt before
//     first write) + clear error message.
//   - Validation failure mid-pipeline → orphan report lists every
//     file that did land.
//   - Dry-run mode → no file writes; returns what would have
//     landed.

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  executeScaffold,
  ScaffoldError,
  type ScaffoldFileWrite,
} from "../../../src/lib/scaffolding/writer";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  createdDirs.length = 0;
});

function makeTmpDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "scaffold-test-"));
  createdDirs.push(d);
  return d;
}

function files(dir: string): ScaffoldFileWrite[] {
  return [
    { path: path.join(dir, "a.block.md"), content: "A content" },
    { path: path.join(dir, "a.tools.ts"), content: "// A tools" },
    { path: path.join(dir, "a/subscriptions/handler.ts"), content: "// A handler" },
  ];
}

describe("executeScaffold — happy path", () => {
  test("writes every file + returns the created list", async () => {
    const dir = makeTmpDir();
    const plan = files(dir);

    const result = await executeScaffold({
      files: plan,
      validate: async () => {},
    });

    assert.equal(result.created.length, 3);
    for (const f of plan) {
      assert.ok(existsSync(f.path), `expected ${f.path} to exist`);
      assert.equal(readFileSync(f.path, "utf8"), f.content);
    }
  });

  test("creates nested directories as needed", async () => {
    const dir = makeTmpDir();
    const nestedPath = path.join(dir, "deep", "nested", "path", "file.ts");
    await executeScaffold({
      files: [{ path: nestedPath, content: "nested" }],
      validate: async () => {},
    });
    assert.ok(existsSync(nestedPath));
  });
});

describe("executeScaffold — pre-existing file (refuse to overwrite)", () => {
  test("pre-existing target path → halt BEFORE any write, no orphans", async () => {
    const dir = makeTmpDir();
    const plan = files(dir);
    // Pre-create the SECOND file so we can verify the first write
    // never happened either (halt is upfront, not mid-pipeline).
    writeFileSync(plan[1].path, "pre-existing content");

    let thrown: unknown = null;
    try {
      await executeScaffold({ files: plan, validate: async () => {} });
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown instanceof ScaffoldError, "should throw ScaffoldError");
    const err = thrown as ScaffoldError;
    assert.equal(err.step, "precheck");
    assert.match(err.message, /a\.tools\.ts/);
    assert.match(err.message, /already exists/);
    // Nothing was created — the existing file was untouched too.
    assert.equal(err.createdFiles.length, 0);
    assert.equal(readFileSync(plan[1].path, "utf8"), "pre-existing content");
    // The first file should NOT have been written.
    assert.ok(!existsSync(plan[0].path), "first write never happened");
  });
});

describe("executeScaffold — validation failure (orphan report)", () => {
  test("validate throws → files remain, error lists orphans", async () => {
    const dir = makeTmpDir();
    const plan = files(dir);
    const validationError = new Error("fake parser failure");

    let thrown: unknown = null;
    try {
      await executeScaffold({
        files: plan,
        validate: async () => {
          throw validationError;
        },
      });
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown instanceof ScaffoldError);
    const err = thrown as ScaffoldError;
    assert.equal(err.step, "validate");
    assert.equal(err.cause, validationError);
    assert.equal(err.createdFiles.length, 3, "all files landed before validate");
    // Files are STILL there — orphan detection, not rollback.
    for (const f of plan) {
      assert.ok(existsSync(f.path), `orphan ${f.path} preserved for builder`);
    }
    // Error message carries the recovery options.
    assert.match(err.message, /fake parser failure/);
    assert.match(err.message, /Files created by this run/);
    assert.match(err.message, /Recovery options/);
    assert.match(err.message, /git clean/);
  });
});

describe("executeScaffold — dry-run mode", () => {
  test("dryRun=true writes nothing + returns what would land", async () => {
    const dir = makeTmpDir();
    const plan = files(dir);

    const result = await executeScaffold({
      files: plan,
      validate: async () => {},
      dryRun: true,
    });

    assert.equal(result.created.length, 3, "created list returned");
    assert.ok(result.dryRun);
    for (const f of plan) {
      assert.ok(!existsSync(f.path), "no file written in dry-run");
    }
  });
});

describe("ScaffoldError — shape", () => {
  test("carries step, createdFiles, cause, and a formatted message", () => {
    const cause = new Error("inner");
    const err = new ScaffoldError({
      step: "validate",
      createdFiles: ["/tmp/a", "/tmp/b"],
      cause,
    });
    assert.equal(err.name, "ScaffoldError");
    assert.equal(err.step, "validate");
    assert.deepEqual(err.createdFiles, ["/tmp/a", "/tmp/b"]);
    assert.equal(err.cause, cause);
    assert.match(err.message, /inner/);
    assert.match(err.message, /\/tmp\/a/);
    assert.match(err.message, /\/tmp\/b/);
  });
});
