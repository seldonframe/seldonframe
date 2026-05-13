import { test } from "node:test";
import assert from "node:assert/strict";
import { readSkillPack, __clearSkillPackCache } from "@/lib/skill-packs/reader";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const FIXTURE_DIR = path.join(process.cwd(), ".test-fixtures", "skill-packs");
const FIXTURE_PATH = path.join(FIXTURE_DIR, "sample.md");

test("skill-pack-reader: reads markdown file content", async () => {
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(FIXTURE_PATH, "# Sample\n\nHello.", "utf8");
  __clearSkillPackCache();

  const content = await readSkillPack(FIXTURE_PATH);
  assert.equal(content, "# Sample\n\nHello.");

  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

test("skill-pack-reader: caches subsequent reads", async () => {
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(FIXTURE_PATH, "original", "utf8");
  __clearSkillPackCache();

  const first = await readSkillPack(FIXTURE_PATH);
  await writeFile(FIXTURE_PATH, "modified", "utf8");
  const second = await readSkillPack(FIXTURE_PATH);

  assert.equal(first, "original");
  assert.equal(second, "original", "cache should return original content even after file change");

  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

test("skill-pack-reader: throws clearly when file missing", async () => {
  __clearSkillPackCache();
  await assert.rejects(
    () => readSkillPack(path.join(FIXTURE_DIR, "does-not-exist.md")),
    /Skill pack not found/
  );
});
