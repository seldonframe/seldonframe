// lib/landing/set-landing-template-for-org.ts
//
// Core, org-id-scoped write for "set (or clear-to-Auto) the public landing
// design template for this workspace". Factored out of
// setLandingTemplateAction (app/(dashboard)/clients/[slug]/ready/actions.ts)
// so a caller that has ALREADY resolved + trusted the org id — e.g. the
// SeldonChat copilot's update_design tool, whose ctx.orgId comes from the
// authenticated conversation, never from model args — can invoke the same
// write without needing a slug lookup + session/ownership re-check (the
// Ready-page server action still does that gate; this is the shared core
// underneath it).
//
// Content-safe: only ever writes theme.landingTemplate / .landingTemplateChoice.
// Never touches landing-page content, blueprints, or any other section data.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { isLandingTemplateId } from "@/components/landing-templates/registry";
import { resolveHealthTemplate, isHealthVertical } from "@/lib/landing/template-selection";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";
import { ARCHETYPES, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { setArchetypeForOrg, classifyArchetypeFromSoul } from "@/lib/workspace/apply-archetype-theme";

function isArchetypeId(id: string): id is AestheticArchetypeId {
  return Object.prototype.hasOwnProperty.call(ARCHETYPES, id);
}

export type SetLandingTemplateResult =
  | { ok: true; landingTemplate: string; landingTemplateChoice: string }
  | { ok: false; error: string };

/**
 * Set (or clear-to-Auto) the org's public landing design template.
 * `choice` is "auto" or one of the registered template ids
 * (isLandingTemplateId). Any other value is rejected rather than silently
 * corrupting the theme.
 *
 * Pure org-id write — no auth/ownership check here. Callers that expose
 * this to an end user (the Ready-page server action, the copilot tool) are
 * responsible for having already resolved a trusted orgId.
 */
export async function setLandingTemplateForOrg(
  orgId: string,
  choice: string,
): Promise<SetLandingTemplateResult> {
  const [org] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      soul: organizations.soul,
      settings: organizations.settings,
      theme: organizations.theme,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    return { ok: false, error: "workspace_not_found" };
  }

  const vertical = ((org.soul as unknown as { industry?: string } | null)?.industry ?? "").toString();
  const prevTheme: OrgTheme = org.theme ?? DEFAULT_ORG_THEME;

  // Two design "tracks" share this write:
  //   • health track   → 5 premium landing templates (theme.landingTemplate)
  //   • archetype track → 8 aesthetic archetypes (theme.aestheticArchetype),
  //                       the re-skin path used by every trades/generic vertical.
  // A trades workspace is on the archetype track unless a premium health
  // template was somehow applied. "auto" is disambiguated the same way the
  // ready page picks the track, so a plumber's "auto" re-classifies an
  // archetype rather than silently landing a wellness template.
  const onHealthTrack =
    isHealthVertical(vertical) || isLandingTemplateId(prevTheme.landingTemplate);

  // ── Archetype track ────────────────────────────────────────────────────
  const revalidate = () => {
    // The public landing renders /w/[slug] dynamically, but revalidate anyway
    // in case ISR is added later, and to bust any RSC cache.
    if (org.slug) revalidatePath(`/w/${org.slug}`);
  };

  if (isArchetypeId(choice)) {
    const res = await setArchetypeForOrg(org.id, choice, choice);
    if (!res.ok) return { ok: false, error: res.reason ?? "archetype_write_failed" };
    revalidate();
    return { ok: true, landingTemplate: prevTheme.landingTemplate ?? "", landingTemplateChoice: choice };
  }

  if (choice === "auto" && !onHealthTrack) {
    const classified = classifyArchetypeFromSoul(org.soul, org.settings);
    const res = await setArchetypeForOrg(org.id, classified, "auto");
    if (!res.ok) return { ok: false, error: res.reason ?? "archetype_write_failed" };
    revalidate();
    return { ok: true, landingTemplate: prevTheme.landingTemplate ?? "", landingTemplateChoice: "auto" };
  }

  // ── Health template track ──────────────────────────────────────────────
  let landingTemplate: string;
  let landingTemplateChoice: string;
  if (choice === "auto") {
    landingTemplate = resolveHealthTemplate(vertical);
    landingTemplateChoice = "auto";
  } else if (isLandingTemplateId(choice)) {
    landingTemplate = choice;
    landingTemplateChoice = choice;
  } else {
    return { ok: false, error: `unknown_template_id: ${choice}` };
  }

  await db
    .update(organizations)
    .set({ theme: { ...prevTheme, landingTemplate, landingTemplateChoice } })
    .where(eq(organizations.id, org.id));

  revalidate();

  return { ok: true, landingTemplate, landingTemplateChoice };
}
