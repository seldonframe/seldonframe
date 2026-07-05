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
import { resolveHealthTemplate } from "@/lib/landing/template-selection";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";

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
      theme: organizations.theme,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    return { ok: false, error: "workspace_not_found" };
  }

  const vertical = ((org.soul as unknown as { industry?: string } | null)?.industry ?? "").toString();

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

  const prevTheme: OrgTheme = org.theme ?? DEFAULT_ORG_THEME;
  await db
    .update(organizations)
    .set({ theme: { ...prevTheme, landingTemplate, landingTemplateChoice } })
    .where(eq(organizations.id, org.id));

  if (org.slug) {
    // The public landing renders /w/[slug] dynamically, but revalidate anyway
    // in case ISR is added later, and to bust any RSC cache — same rationale
    // as setLandingTemplateAction's original comment.
    revalidatePath(`/w/${org.slug}`);
  }

  return { ok: true, landingTemplate, landingTemplateChoice };
}
