// 2026-07-16 — Seed vertical-aware booking intake fields on a workspace's
// booking-template rows at CREATION time.
//
// Why: v1.55.0 removed enhanceLandingForWorkspace from the default creation
// path, and the intake-field seeding lived only there — so every workspace
// built via the /try URL flow (run-create-from-url → createFullWorkspace) or
// the paste flow shipped booking templates with metadata.intakeFields unset.
// Every public booking render then fell into the lazy resolver, whose
// theme.aestheticArchetype step let a LOOK pick (design picker / copilot
// update_design) drive intake SEMANTICS — live-confirmed on an HVAC company
// that picked the "Technical" look and got B2B consulting questions
// (Company / Role / Team size / Budget) instead of dispatch questions.
//
// Stored fields win over the lazy resolver (resolvePublicBookingContext
// checks metadata.intakeFields first), so seeding here makes intake
// semantics immune to later look switches.
//
// DB access is injected (same extracted-for-testability pattern as
// resolveOrgArchetype in lib/page-blocks/persist.ts) so the seeding
// contract is unit-testable without a database.

import {
  classifyArchetype,
  type ArchetypeClassifierInput,
  type AestheticArchetypeId,
} from "./aesthetic-archetypes";
import { getBookingIntakeFieldsForArchetype } from "./booking-intake-fields";

export interface SeedIntakeFieldsResult {
  archetype: AestheticArchetypeId;
  /** Template rows that received intake fields. */
  seeded: number;
  /** Template rows left untouched because they already carry fields. */
  skipped: number;
}

/**
 * Classify the archetype from BUSINESS signals (vertical / emergency /
 * description — never the visual theme) and write the archetype's intake
 * fields onto every booking-template row that doesn't already have any.
 * Rows with existing fields are never clobbered (operator-edited custom
 * fields, soul-package templates).
 */
export async function seedIntakeFieldsOnBookingTemplates(opts: {
  classifier: ArchetypeClassifierInput;
  templates: Array<{ id: string; metadata: unknown }>;
  writeTemplateMetadata: (
    templateId: string,
    metadata: Record<string, unknown>,
  ) => Promise<void>;
}): Promise<SeedIntakeFieldsResult> {
  const archetype = classifyArchetype(opts.classifier);
  const intakeFields = getBookingIntakeFieldsForArchetype(archetype);

  let seeded = 0;
  let skipped = 0;
  for (const tpl of opts.templates) {
    const meta =
      (tpl.metadata && typeof tpl.metadata === "object"
        ? (tpl.metadata as Record<string, unknown>)
        : null) ?? {};
    if (Array.isArray(meta.intakeFields) && meta.intakeFields.length > 0) {
      skipped += 1;
      continue;
    }
    await opts.writeTemplateMetadata(tpl.id, { ...meta, intakeFields });
    seeded += 1;
  }

  return { archetype, seeded, skipped };
}
