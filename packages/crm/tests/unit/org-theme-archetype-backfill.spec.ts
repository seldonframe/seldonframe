// Tests for v1.54.0 lazy backfill of org.theme.aestheticArchetype.
//
// Pre-v1.54 workspaces have a theme JSONB without aestheticArchetype.
// resolveOrgArchetype must:
//   1. Use org.theme.aestheticArchetype when present (no DB write)
//   2. Re-classify from soul fields + patch theme when absent
//   3. Be idempotent: second call after backfill reads from theme directly

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveOrgArchetype,
} from "../../src/lib/page-blocks/persist";
import type { OrgTheme } from "../../src/lib/theme/types";
import type { OrgSoul } from "../../src/lib/soul/types";

// In-memory "DB" — captures writes so the test can assert the lazy
// backfill happened. The real resolveOrgArchetype takes a DB-write
// callback as its third arg (extracted for testability).

describe("resolveOrgArchetype — happy path (archetype already in theme)", () => {
  test("returns stored archetypeId without writing", async () => {
    const theme: OrgTheme = {
      primaryColor: "#000",
      accentColor: "#fff",
      fontFamily: "Geist",
      mode: "light",
      borderRadius: "rounded",
      logoUrl: null,
      aestheticArchetype: "bold-urgency",
    };
    let writeCount = 0;
    const id = await resolveOrgArchetype(
      "ws-1",
      { theme, soul: null, name: "Mr Rooter" },
      async () => {
        writeCount++;
      },
    );
    assert.equal(id, "bold-urgency");
    assert.equal(writeCount, 0, "no write expected when archetype already present");
  });
});

describe("resolveOrgArchetype — lazy backfill", () => {
  test("re-classifies from soul + patches theme when archetype absent", async () => {
    const theme: OrgTheme = {
      primaryColor: "#000",
      accentColor: "#fff",
      fontFamily: "Geist",
      mode: "light",
      borderRadius: "rounded",
      logoUrl: null,
      // aestheticArchetype absent — pre-v1.54 shape
    };
    const soul = {
      personality_vertical: "plumbing",
      emergency_service: true,
      same_day: null,
      review_rating: null,
      review_count: null,
      business_description: "24/7 emergency plumbing in Austin",
    } as unknown as OrgSoul;

    // Cast null to the union so TS treats the variable's effective type
    // as { theme: OrgTheme } | null — without the cast, control-flow
    // analysis narrows it to `null` (its only visibly-assigned value)
    // and post-assert.ok narrows to `never`. Same pattern as
    // dispatch-llm-call.spec.ts.
    let writeCalledWith: { theme: OrgTheme } | null =
      null as { theme: OrgTheme } | null;
    const id = await resolveOrgArchetype(
      "ws-2",
      { theme, soul, name: "Mr Rooter" },
      async (patch) => {
        writeCalledWith = patch;
      },
    );
    assert.equal(id, "bold-urgency");
    assert.ok(writeCalledWith, "lazy backfill should have written");
    assert.equal(writeCalledWith!.theme.aestheticArchetype, "bold-urgency");
  });

  test("falls back to editorial-warm when soul is null", async () => {
    const theme: OrgTheme = {
      primaryColor: "#000",
      accentColor: "#fff",
      fontFamily: "Geist",
      mode: "light",
      borderRadius: "rounded",
      logoUrl: null,
    };
    let writeCalled = false;
    const id = await resolveOrgArchetype(
      "ws-3",
      { theme, soul: null, name: "Unknown Biz" },
      async () => {
        writeCalled = true;
      },
    );
    // classifyArchetype's catch-all is editorial-warm
    assert.equal(id, "editorial-warm");
    assert.ok(writeCalled);
  });
});
