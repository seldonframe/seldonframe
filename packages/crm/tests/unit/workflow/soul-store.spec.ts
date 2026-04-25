// Tests for the SoulStore abstraction. SLICE 3 C1 per audit §4.3.
//
// The interface has two impls:
//   - InMemorySoulStore — test double.
//   - DrizzleSoulStore — production, wraps organizations.soul JSONB.
//
// This spec tests the contract via the in-memory impl. DrizzleSoulStore
// round-trips are exercised at integration scope (not unit).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { InMemorySoulStore } from "../../../src/lib/workflow/state-access/soul-store-memory";

describe("InMemorySoulStore — readPath", () => {
  test("returns the value at a top-level key", async () => {
    const store = new InMemorySoulStore();
    store._seed("org-1", { businessName: "Acme Corp" });
    const value = await store.readPath("org-1", "businessName");
    assert.equal(value, "Acme Corp");
  });

  test("walks dotted paths through nested objects", async () => {
    const store = new InMemorySoulStore();
    store._seed("org-1", {
      pipeline: { name: "Sales", stages: [{ name: "Lead" }, { name: "Won" }] },
    });
    assert.equal(await store.readPath("org-1", "pipeline.name"), "Sales");
    const stages = await store.readPath("org-1", "pipeline.stages");
    assert.deepEqual(stages, [{ name: "Lead" }, { name: "Won" }]);
  });

  test("returns undefined for a missing path (not an error)", async () => {
    const store = new InMemorySoulStore();
    store._seed("org-1", { businessName: "Acme" });
    const value = await store.readPath("org-1", "doesNotExist");
    assert.equal(value, undefined);
  });

  test("returns undefined for a partial-miss along the walk", async () => {
    const store = new InMemorySoulStore();
    store._seed("org-1", { a: { b: 1 } });
    assert.equal(await store.readPath("org-1", "a.c"), undefined);
    assert.equal(await store.readPath("org-1", "a.b.c.d"), undefined);
  });

  test("returns undefined for an org with no seeded Soul", async () => {
    const store = new InMemorySoulStore();
    assert.equal(await store.readPath("org-nonexistent", "businessName"), undefined);
  });

  test("empty path returns the full Soul object", async () => {
    const store = new InMemorySoulStore();
    store._seed("org-1", { x: 1 });
    const value = await store.readPath("org-1", "");
    assert.deepEqual(value, { x: 1 });
  });
});

describe("InMemorySoulStore — writePath", () => {
  test("creates a top-level key", async () => {
    const store = new InMemorySoulStore();
    await store.writePath("org-1", "onboardingStage", "qualified");
    assert.equal(await store.readPath("org-1", "onboardingStage"), "qualified");
  });

  test("overwrites an existing top-level key", async () => {
    const store = new InMemorySoulStore();
    store._seed("org-1", { stage: "new" });
    await store.writePath("org-1", "stage", "qualified");
    assert.equal(await store.readPath("org-1", "stage"), "qualified");
  });

  test("creates nested objects for deep paths that don't exist", async () => {
    const store = new InMemorySoulStore();
    await store.writePath("org-1", "deep.nested.key", 42);
    assert.equal(await store.readPath("org-1", "deep.nested.key"), 42);
  });

  test("overwrites along an existing path without clobbering siblings", async () => {
    const store = new InMemorySoulStore();
    store._seed("org-1", {
      contact: { name: "Alice", age: 30 },
    });
    await store.writePath("org-1", "contact.age", 31);
    assert.equal(await store.readPath("org-1", "contact.name"), "Alice");
    assert.equal(await store.readPath("org-1", "contact.age"), 31);
  });

  test("supports object values (not just primitives)", async () => {
    const store = new InMemorySoulStore();
    await store.writePath("org-1", "preferences", { theme: "dark", lang: "en" });
    assert.deepEqual(await store.readPath("org-1", "preferences"), {
      theme: "dark",
      lang: "en",
    });
  });

  test("different orgs are isolated", async () => {
    const store = new InMemorySoulStore();
    await store.writePath("org-A", "stage", "qualified");
    await store.writePath("org-B", "stage", "new");
    assert.equal(await store.readPath("org-A", "stage"), "qualified");
    assert.equal(await store.readPath("org-B", "stage"), "new");
  });
});
