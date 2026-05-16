// v1.55.0 — Seed the default public landing for a new workspace with
// a single chatbotPreview section. Replaces the legacy soul-driven
// landing seed for the lean URL flow (create_workspace_from_url path).
//
// The chatbotPreview section is the default public surface — operator
// can replace it later via the landing-page-creation SKILL.md, which
// triggers persist_block calls that overwrite this section with
// hero/services/etc.
//
// This module exports BOTH a pure shape builder (buildChatbotPreviewSection)
// AND the I/O wrapper (seedChatbotPreviewLanding) so tests can verify
// the shape without spinning up a DB.

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { landingPages } from "@/db/schema/landing-pages";
import { organizations } from "@/db/schema/organizations";
import type { LandingPageSection } from "@/components/landing/sections/types";

export interface SeedChatbotPreviewInput {
  orgId: string;
  businessName: string;
  /** Soul.business_description preferred. null falls back to a generic. */
  tagline: string | null;
  orgSlug: string;
  agentSlug: string;
  /** Defaults to process.env.WORKSPACE_BASE_DOMAIN if set, else "app.seldonframe.com". */
  workspaceBaseDomain?: string;
}

const TAGLINE_MAX_CHARS = 200;

/**
 * Pure shape builder — no I/O. Tests use this to verify the section
 * shape without spinning up a DB.
 */
export function buildChatbotPreviewSection(
  input: SeedChatbotPreviewInput,
): LandingPageSection {
  const baseDomain =
    input.workspaceBaseDomain ??
    process.env.WORKSPACE_BASE_DOMAIN ??
    "app.seldonframe.com";

  const embedUrl = `https://${baseDomain}/api/v1/public/agent/${input.orgSlug}--${input.agentSlug}/embed.js`;

  const rawTagline =
    input.tagline?.trim() ||
    `AI receptionist — ask ${input.businessName} anything`;
  const tagline =
    rawTagline.length > TAGLINE_MAX_CHARS
      ? rawTagline.slice(0, TAGLINE_MAX_CHARS)
      : rawTagline;

  return {
    type: "chatbotPreview",
    order: 1,
    content: {
      businessName: input.businessName,
      tagline,
      embedUrl,
    },
  };
}

/**
 * I/O wrapper — replaces the existing landing_pages row for this
 * workspace with a single chatbotPreview section. If no row exists,
 * inserts one. Logs `chatbot_preview_seeded` on success.
 *
 * Soft-fail: errors are logged but never thrown — workspace creation
 * never blocks on this. The fallback is "no landing page row" which
 * renders as a 404 (acceptable; operator can regenerate via the
 * landing-page-creation SKILL.md).
 */
export async function seedChatbotPreviewLanding(
  input: SeedChatbotPreviewInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const section = buildChatbotPreviewSection(input);

    // Fetch existing landing_pages row for this org's home slug.
    const [existing] = await db
      .select({ id: landingPages.id })
      .from(landingPages)
      .where(
        and(
          eq(landingPages.orgId, input.orgId),
          eq(landingPages.slug, "home"),
        ),
      )
      .limit(1);

    if (existing) {
      // Replace sections; null out contentHtml/Css so the sections-based
      // renderer takes precedence.
      await db
        .update(landingPages)
        .set({
          sections: [section] as unknown as Record<string, unknown>[],
          contentHtml: null,
          contentCss: null,
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, existing.id));
    } else {
      // Workspace doesn't have a landing_pages row yet (unusual for v2
      // flow — anonymous-workspace.ts creates one — but defensive).
      await db.insert(landingPages).values({
        orgId: input.orgId,
        slug: "home",
        title: input.businessName,
        sections: [section] as unknown as Record<string, unknown>[],
        contentHtml: null,
        contentCss: null,
      });
    }

    console.warn(
      JSON.stringify({
        event: "chatbot_preview_seeded",
        workspace_id: input.orgId,
        agent_slug: input.agentSlug,
        seeded_replace: Boolean(existing),
      }),
    );

    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        event: "chatbot_preview_seed_failed",
        workspace_id: input.orgId,
        reason,
      }),
    );
    return { ok: false, reason };
  }
}

/** Convenience: load businessName + orgSlug + tagline from the org row
 *  and seed in one call. Used by v2/complete. */
export async function seedChatbotPreviewLandingForOrg(args: {
  orgId: string;
  agentSlug: string;
  workspaceBaseDomain?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [org] = await db
    .select({
      name: organizations.name,
      slug: organizations.slug,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, args.orgId))
    .limit(1);

  if (!org) {
    return { ok: false, reason: "org_not_found" };
  }

  // Pull tagline from soul.business_description (snake_case JSONB shape,
  // not camelCase TS interface — codebase convention; see resolveOrgArchetype
  // in lib/page-blocks/persist.ts for the same pattern).
  const soulRecord = org.soul as Record<string, unknown> | null;
  const tagline =
    typeof soulRecord?.business_description === "string"
      ? (soulRecord.business_description as string)
      : null;

  return seedChatbotPreviewLanding({
    orgId: args.orgId,
    businessName: org.name,
    tagline,
    orgSlug: org.slug,
    agentSlug: args.agentSlug,
    workspaceBaseDomain: args.workspaceBaseDomain,
  });
}
