import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The script is a .mjs sibling of the package's scripts/ dir. Import its pure
// helper directly (allowJs + bundler resolution gives us inferred types); for
// the end-to-end "exits non-zero" behavior we shell out to the real script.
import { findOrphanMigrations, OUT_OF_BAND_BASELINE } from "../../../scripts/check-migrations-journaled.mjs";

const SCRIPT_PATH = resolve(
  fileURLToPath(new URL("../../../scripts/check-migrations-journaled.mjs", import.meta.url)),
);

// ── Pure helper: findOrphanMigrations ──────────────────────────────────────

test("findOrphanMigrations: flags a .sql file that's neither journaled nor baselined", () => {
  const sqlFiles = ["0000_panoramic_jubilee.sql", "0056_orphan_feature.sql"];
  const journalTags = new Set(["0000_panoramic_jubilee"]);
  const baseline = new Set<string>(); // empty baseline for this case

  const orphans = findOrphanMigrations(sqlFiles, journalTags, baseline);
  assert.deepEqual(orphans, ["0056_orphan_feature"]);
});

test("findOrphanMigrations: all-journaled → no orphans", () => {
  const sqlFiles = ["0000_panoramic_jubilee.sql", "0019_silky_viper.sql"];
  const journalTags = new Set(["0000_panoramic_jubilee", "0019_silky_viper"]);

  const orphans = findOrphanMigrations(sqlFiles, journalTags, new Set());
  assert.deepEqual(orphans, []);
});

test("findOrphanMigrations: a baselined out-of-band file is NOT an orphan", () => {
  const sqlFiles = ["0049_proposals.sql"];
  const journalTags = new Set<string>(); // not journaled
  const baseline = new Set(["0049_proposals"]); // but known out-of-band

  const orphans = findOrphanMigrations(sqlFiles, journalTags, baseline);
  assert.deepEqual(orphans, []);
});

test("findOrphanMigrations: ignores non-.sql files", () => {
  const sqlFiles = ["README.md", "meta", "0056_orphan.sql"];
  const orphans = findOrphanMigrations(sqlFiles, new Set(), new Set());
  assert.deepEqual(orphans, ["0056_orphan"]);
});

test("findOrphanMigrations: accepts arrays as well as Sets", () => {
  const orphans = findOrphanMigrations(
    ["a.sql", "b.sql"],
    ["a"], // journaled
    ["b"], // baselined
  );
  assert.deepEqual(orphans, []);
});

test("findOrphanMigrations: orphans are returned sorted", () => {
  const orphans = findOrphanMigrations(
    ["0099_z.sql", "0010_a.sql", "0050_m.sql"],
    new Set(),
    new Set(),
  );
  assert.deepEqual(orphans, ["0010_a", "0050_m", "0099_z"]);
});

test("OUT_OF_BAND_BASELINE contains the known out-of-band migrations", () => {
  // Spot-check a few so an accidental wholesale deletion of the baseline is
  // caught (which would make the real-repo check fail with 44 false orphans).
  assert.ok(OUT_OF_BAND_BASELINE.has("0049_proposals"));
  assert.ok(OUT_OF_BAND_BASELINE.has("0022_organizations_timezone"));
  assert.ok(OUT_OF_BAND_BASELINE.has("0008_missing_tables"));
  // The two incident migrations are journaled, NOT baselined — assert they
  // are absent from the baseline so they can never be silently re-orphaned.
  assert.ok(!OUT_OF_BAND_BASELINE.has("0019_silky_viper"));
  assert.ok(!OUT_OF_BAND_BASELINE.has("0055_users_onboarding_completed_at"));
});

// ── End-to-end: the script against the REAL repo and against a fixture ──────

test("script passes against the current repo (exit 0)", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `expected exit 0 against real repo. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.match(result.stdout, /0 orphans/);
});

test("script exits non-zero and names the orphan in a fixture dir", () => {
  // Build a throwaway drizzle/ layout: one journaled file + one orphan, then
  // run the REAL script against it via --dir and assert it fails and names the
  // orphan. This exercises the actual CLI exit path, not just the helper.
  const dir = mkdtempSync(join(tmpdir(), "journal-check-"));
  try {
    const drizzleDir = join(dir, "drizzle");
    const metaDir = join(drizzleDir, "meta");
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(join(drizzleDir, "0000_panoramic_jubilee.sql"), "SELECT 1;");
    writeFileSync(join(drizzleDir, "0099_forgot_to_journal.sql"), "ALTER TABLE x ADD COLUMN y text;");
    writeFileSync(
      join(metaDir, "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [{ idx: 0, version: "7", when: 1, tag: "0000_panoramic_jubilee", breakpoints: true }],
      }),
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--dir", drizzleDir], {
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0, "expected non-zero exit for a dir with an orphan");
    // The orphan must be named in the output so an operator knows what to fix.
    assert.match(result.stderr, /0099_forgot_to_journal/);
    // The journaled file must NOT be reported as an orphan.
    assert.doesNotMatch(result.stderr, /0000_panoramic_jubilee\.sql\b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("script exits 0 against an all-journaled fixture dir", () => {
  const dir = mkdtempSync(join(tmpdir(), "journal-check-ok-"));
  try {
    const drizzleDir = join(dir, "drizzle");
    const metaDir = join(drizzleDir, "meta");
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(join(drizzleDir, "0000_panoramic_jubilee.sql"), "SELECT 1;");
    writeFileSync(join(drizzleDir, "0001_silky_viper.sql"), "ALTER TABLE x ADD COLUMN y text;");
    writeFileSync(
      join(metaDir, "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [
          { idx: 0, version: "7", when: 1, tag: "0000_panoramic_jubilee", breakpoints: true },
          { idx: 1, version: "7", when: 2, tag: "0001_silky_viper", breakpoints: true },
        ],
      }),
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--dir", drizzleDir], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `expected exit 0; stderr:\n${result.stderr}`);
    assert.match(result.stdout, /0 orphans/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
