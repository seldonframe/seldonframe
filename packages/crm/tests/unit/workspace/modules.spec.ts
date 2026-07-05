// Unit tests for lib/workspace/modules.ts — pure module registry + SF_SIMPLE_HOME flag.
// Task 1 of the simple-home plan (foundation: later tasks import these exact names).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  MODULE_IDS,
  DEFAULT_FRESH_MODULES,
  MODULE_REGISTRY,
  type ModuleId,
} from "../../../src/lib/workspace/modules";
import { isSimpleHomeOn } from "../../../src/lib/web-build/policy";

describe("MODULE_IDS", () => {
  test("has the 10 ids in order", () => {
    assert.deepEqual(MODULE_IDS, [
      "home",
      "website",
      "bookings",
      "customers",
      "leads",
      "inbox",
      "messaging",
      "money",
      "agents",
      "integrations",
    ]);
  });
});

describe("DEFAULT_FRESH_MODULES", () => {
  test("equals home, website, bookings, customers", () => {
    assert.deepEqual(DEFAULT_FRESH_MODULES, ["home", "website", "bookings", "customers"]);
  });
});

describe("MODULE_REGISTRY", () => {
  test("every entry has a non-empty label and description", () => {
    for (const entry of MODULE_REGISTRY) {
      assert.ok(entry.label.trim().length > 0, `${entry.id} label empty`);
      assert.ok(entry.description.trim().length > 0, `${entry.id} description empty`);
    }
  });

  test("copy rule: no entry's label or description contains banned owner-facing jargon", () => {
    const banned = ["block", "intake", "mcp", "workspace"];
    for (const entry of MODULE_REGISTRY) {
      const haystack = `${entry.label} ${entry.description}`.toLowerCase();
      for (const word of banned) {
        assert.ok(
          !haystack.includes(word),
          `${entry.id} copy contains banned word "${word}": "${haystack}"`,
        );
      }
    }
  });

  test("exactly 'home' has alwaysOn: true", () => {
    const alwaysOnIds = MODULE_REGISTRY.filter((m) => m.alwaysOn).map((m) => m.id);
    assert.deepEqual(alwaysOnIds, ["home"]);
  });

  test("registry covers exactly the MODULE_IDS set, same order", () => {
    assert.deepEqual(
      MODULE_REGISTRY.map((m) => m.id),
      MODULE_IDS as ModuleId[],
    );
  });
});

describe("isSimpleHomeOn", () => {
  test("true only for exact '1'", () => {
    assert.equal(isSimpleHomeOn({ SF_SIMPLE_HOME: "1" }), true);
  });

  test("false for '0'", () => {
    assert.equal(isSimpleHomeOn({ SF_SIMPLE_HOME: "0" }), false);
  });

  test("false for 'true'", () => {
    assert.equal(isSimpleHomeOn({ SF_SIMPLE_HOME: "true" }), false);
  });

  test("false for undefined", () => {
    assert.equal(isSimpleHomeOn({ SF_SIMPLE_HOME: undefined }), false);
  });

  test("true for '1' with surrounding whitespace (env-var paste safety)", () => {
    assert.equal(isSimpleHomeOn({ SF_SIMPLE_HOME: " 1\n" }), true);
  });
});
