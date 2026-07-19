// Tests for creation-time booking intake-field seeding (2026-07-16).
//
// v1.55.0 removed enhanceLandingForWorkspace from the default creation path
// and the intake-field seeding lived only there — so /try-URL-flow and
// paste-flow workspaces shipped booking templates with metadata.intakeFields
// unset, leaving intake semantics to the render-time lazy resolver (where a
// later look switch could stamp the wrong questions). createFullWorkspace
// now seeds the fields at creation via seedIntakeFieldsOnBookingTemplates;
// stored fields win over the lazy resolver, making intake semantics immune
// to look switches. DB writes are injected so the contract tests run
// without a database (same pattern as resolveOrgArchetype).
//
// Run: node --test --import tsx packages/crm/tests/unit/seed-booking-intake-fields.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { seedIntakeFieldsOnBookingTemplates } from "@/lib/workspace/seed-booking-intake-fields";

function collectWrites() {
  const writes = new Map<string, Record<string, unknown>>();
  return {
    writes,
    writeTemplateMetadata: async (id: string, metadata: Record<string, unknown>) => {
      writes.set(id, metadata);
    },
  };
}

describe("seedIntakeFieldsOnBookingTemplates", () => {
  test("HVAC + emergency → seeds bold-urgency fields on the template row (URL-flow shape)", async () => {
    const { writes, writeTemplateMetadata } = collectWrites();
    const result = await seedIntakeFieldsOnBookingTemplates({
      classifier: {
        vertical: "hvac",
        emergencyService: true,
        sameDay: true,
        reviewRating: 4.8,
        reviewCount: 120,
        businessDescription: "Residential and commercial HVAC repair, 24/7 emergency service",
      },
      // The exact metadata shape soul/install.ts writes at creation —
      // no intakeFields key at all.
      templates: [
        {
          id: "tpl-1",
          metadata: {
            kind: "appointment_type",
            description: "Service call",
            durationMinutes: 60,
            price: 0,
            availability: {},
          },
        },
      ],
      writeTemplateMetadata,
    });

    assert.equal(result.archetype, "bold-urgency");
    assert.equal(result.seeded, 1);
    assert.equal(result.skipped, 0);

    const written = writes.get("tpl-1");
    assert.ok(written, "expected a metadata write for tpl-1");
    const ids = (written.intakeFields as Array<{ id: string }>).map((f) => f.id);
    assert.ok(ids.includes("issue_type"), `expected dispatch questions, got: ${ids.join(", ")}`);
    assert.ok(ids.includes("urgency"));
    assert.ok(ids.includes("notes"), "universal trailer appended");
    assert.ok(!ids.includes("company"), "B2B fields must not be seeded for HVAC");
    // Existing metadata keys survive the merge.
    assert.equal(written.kind, "appointment_type");
    assert.equal(written.durationMinutes, 60);
  });

  test("rows that already carry intakeFields are never clobbered", async () => {
    const operatorFields = [{ id: "custom_question", label: "Custom", type: "text" }];
    const { writes, writeTemplateMetadata } = collectWrites();
    const result = await seedIntakeFieldsOnBookingTemplates({
      classifier: { vertical: "hvac", emergencyService: true },
      templates: [
        { id: "tpl-custom", metadata: { kind: "appointment_type", intakeFields: operatorFields } },
        { id: "tpl-empty", metadata: { kind: "appointment_type", intakeFields: [] } },
        { id: "tpl-null-meta", metadata: null },
      ],
      writeTemplateMetadata,
    });

    assert.equal(result.seeded, 2, "empty-array and null-metadata rows get seeded");
    assert.equal(result.skipped, 1, "operator-edited row is skipped");
    assert.ok(!writes.has("tpl-custom"), "no write for the row with existing fields");
    assert.ok(writes.has("tpl-empty"));
    assert.ok(writes.has("tpl-null-meta"));
  });

  test("no emergency signals + generic vertical → editorial-warm baseline (never empty)", async () => {
    const { writes, writeTemplateMetadata } = collectWrites();
    const result = await seedIntakeFieldsOnBookingTemplates({
      classifier: { vertical: "general", businessDescription: "Small-batch candle maker" },
      templates: [{ id: "tpl-1", metadata: {} }],
      writeTemplateMetadata,
    });

    assert.equal(result.archetype, "editorial-warm");
    const ids = (writes.get("tpl-1")!.intakeFields as Array<{ id: string }>).map((f) => f.id);
    assert.ok(ids.length > 0, "always seeds a non-empty field set");
    assert.ok(ids.includes("notes"));
  });

  test("physio on the 'general' vertical → clinical intake seeded, never contractor fields", async () => {
    // Health niches (physio/chiro/massage/yoga…) aren't in the CRM
    // personality registry, so they resolve to vertical="general". The
    // seeder must run the same health override as the render-time
    // resolver — otherwise contractor fields get PERMANENTLY seeded
    // (stored fields win over the lazy resolver, so the render-time
    // override could never correct them).
    const { writes, writeTemplateMetadata } = collectWrites();
    const result = await seedIntakeFieldsOnBookingTemplates({
      businessName: "Round Rock Physiotherapy",
      classifier: {
        vertical: "general",
        businessDescription: "Physiotherapy and sports rehab clinic in Round Rock",
      },
      templates: [{ id: "tpl-1", metadata: { kind: "appointment_type" } }],
      writeTemplateMetadata,
    });

    assert.equal(result.archetype, "clinical-trust");
    const ids = (writes.get("tpl-1")!.intakeFields as Array<{ id: string }>).map((f) => f.id);
    assert.ok(ids.includes("concern"), `expected clinical fields, got: ${ids.join(", ")}`);
    assert.ok(!ids.includes("budget_range"), "contractor budget question must not be seeded for a physio");
  });

  test("general vertical + HVAC business name → dispatch fields via name hints", async () => {
    const { writes, writeTemplateMetadata } = collectWrites();
    const result = await seedIntakeFieldsOnBookingTemplates({
      businessName: "Roadrunner HVAC & Air",
      classifier: { vertical: "general", businessDescription: "Heating and cooling service" },
      templates: [{ id: "tpl-1", metadata: {} }],
      writeTemplateMetadata,
    });

    assert.equal(result.archetype, "bold-urgency");
    const ids = (writes.get("tpl-1")!.intakeFields as Array<{ id: string }>).map((f) => f.id);
    assert.ok(ids.includes("issue_type"), `expected dispatch fields via name hints, got: ${ids.join(", ")}`);
  });
});
