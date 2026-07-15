// Tests for the demo-scenes registry (spec
// docs/superpowers/specs/2026-07-14-demo-scenes-design.md, plan Task 1).
//
// Invariants:
//   1. Every id is unique
//   2. Every id is kebab-case
//   3. Every entry has a non-empty title + blurb
//   4. getDemoScene("nope") -> null
//   5. getDemoScene(<real id>) -> the matching entry
//   6. The component map (scene-components.tsx) covers EXACTLY the
//      registry's id set — no missing components, no orphan components.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { DEMO_SCENES, getDemoScene } from "../../../src/components/demo-scenes/registry";
import { SCENE_COMPONENTS } from "../../../src/components/demo-scenes/scene-components";

const KEBAB_CASE = /^[a-z]+(-[a-z]+)*$/;

describe("DEMO_SCENES registry", () => {
  test("every id is unique", () => {
    const ids = DEMO_SCENES.map((scene) => scene.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate scene id found");
  });

  test("every id is kebab-case", () => {
    for (const scene of DEMO_SCENES) {
      assert.match(scene.id, KEBAB_CASE, `"${scene.id}" is not kebab-case`);
    }
  });

  test("every entry has a non-empty title and blurb", () => {
    for (const scene of DEMO_SCENES) {
      assert.ok(scene.title.trim().length > 0, `${scene.id} has an empty title`);
      assert.ok(scene.blurb.trim().length > 0, `${scene.id} has an empty blurb`);
    }
  });

  test("at least one scene is registered", () => {
    assert.ok(DEMO_SCENES.length > 0, "registry must not be empty");
  });
});

describe("getDemoScene", () => {
  test("returns null for an unknown id", () => {
    assert.equal(getDemoScene("nope"), null);
  });

  test("returns the matching entry for a known id", () => {
    const first = DEMO_SCENES[0];
    assert.equal(getDemoScene(first.id), first);
  });
});

describe("SCENE_COMPONENTS covers exactly the registry ids", () => {
  test("no registry id is missing a component", () => {
    for (const scene of DEMO_SCENES) {
      assert.ok(
        SCENE_COMPONENTS[scene.id],
        `registry id "${scene.id}" has no entry in SCENE_COMPONENTS`,
      );
    }
  });

  test("no orphan components exist outside the registry", () => {
    const registryIds = new Set(DEMO_SCENES.map((scene) => scene.id));
    for (const id of Object.keys(SCENE_COMPONENTS)) {
      assert.ok(registryIds.has(id), `SCENE_COMPONENTS has orphan id "${id}" not in registry`);
    }
  });

  test("key sets are exactly equal", () => {
    const registryIds = DEMO_SCENES.map((scene) => scene.id).sort();
    const componentIds = Object.keys(SCENE_COMPONENTS).sort();
    assert.deepEqual(componentIds, registryIds);
  });
});
