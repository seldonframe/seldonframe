// v1 PWA — dynamic per-agency web app manifest.
//
// GET /portal/<orgSlug>/manifest.webmanifest → resolve the workspace
// by slug → effective partner-agency branding → a manifest whose
// name/theme_color identify the AGENCY (white-label) and whose
// start_url + scope are pinned to /portal/<orgSlug>/ so the installed
// app opens straight into this contractor's mobile shell.
//
// Falls back to SeldonFrame defaults when the slug is unknown or the
// workspace has no active agency (branding resolver already returns
// SF defaults in those cases). Never throws on a bad slug.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import {
  brandingToManifestOptions,
  generatePwaManifest,
} from "@seldonframe/core/virality";

// Per-slug branding can change (agency attach/detach); don't statically
// cache. Cheap query + small JSON.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await context.params;

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  // brandingToManifestOptions only reads the ManifestBrandingInput
  // subset (is_white_label, brand_name, logo_url, primary_color,
  // accent_color). For a known slug we pass the full EffectiveBranding
  // (structurally compatible); for an unknown slug we pass a minimal
  // SF-default input rather than the full 10-field EffectiveBranding,
  // so this literal can't drift from that interface.
  const branding = org
    ? await getEffectiveBrandingForWorkspace(org.id)
    : {
        is_white_label: false,
        brand_name: "SeldonFrame",
        logo_url: null,
        primary_color: null,
        accent_color: null,
      };

  const manifest = generatePwaManifest(
    brandingToManifestOptions({ orgSlug, branding }),
  );

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
