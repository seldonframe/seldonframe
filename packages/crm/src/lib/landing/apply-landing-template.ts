// lib/landing/apply-landing-template.ts
//
// Auto-pick + persist a health/wellness landing template at workspace creation.
// Called from the web create flows (run-create-from-url / -paste) right after
// createFullWorkspace. Best-effort, idempotent, self-contained (reads + writes
// organizations.theme itself).
//
// Behavior:
//   - Classifies the health sub-vertical from the extracted facts.
//   - Non-health → no-op (classifier returns null → /w/[slug] keeps landing-r1).
//   - Health → writes theme.landingTemplate (+ landingTemplateChoice "auto") so
//     /w/[slug] renders the premium template.
//   - Respects an explicit operator choice: if landingTemplateChoice is already
//     a concrete id (hand-picked), leaves it untouched.

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";
import { classifyHealthTemplate } from "@/lib/landing/template-selection";

export async function applyLandingTemplateForWorkspace(
  orgId: string,
  facts: {
    businessName?: string | null;
    businessDescription?: string | null;
    services?: readonly string[] | null;
  },
): Promise<{ applied: boolean; template: string | null }> {
  const template = classifyHealthTemplate(facts);
  if (!template) return { applied: false, template: null };

  const [org] = await db
    .select({ theme: organizations.theme })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return { applied: false, template: null };

  const prev: OrgTheme = org.theme ?? DEFAULT_ORG_THEME;
  // Respect an explicit, non-auto operator choice — only fill the unset/auto case.
  if (prev.landingTemplateChoice && prev.landingTemplateChoice !== "auto") {
    return { applied: false, template: prev.landingTemplate ?? null };
  }

  await db
    .update(organizations)
    .set({
      theme: { ...prev, landingTemplate: template, landingTemplateChoice: "auto" },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return { applied: true, template };
}
