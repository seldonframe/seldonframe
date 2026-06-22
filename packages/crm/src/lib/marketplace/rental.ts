// Agent-marketplace MCP rental — server action.
//
// generateAgentRentalKeyAction mints a fresh signed rental key for the caller's
// org against a published kind:'agent' listing, and returns the key + the live
// MCP endpoint URL. The listing's "Rent via MCP" panel calls this to replace
// the placeholder `Bearer sk_live_…` in the copyable client-config snippet with
// a REAL key the renter can paste straight into their MCP client.
//
// Thin by design (check-use-server.sh: a "use server" file exports only async
// functions). All the testable logic lives in the pure modules this wires:
//   - rental-token.ts  (mint/verify — unit-tested)
//   - rental-secret.ts (secret resolution)
//   - agent-mcp-rpc.ts (the wire layer)
// This file only does: org-guard → confirm the listing is a published agent →
// mint → build the endpoint URL.
//
// FOLLOW-ON: a revocable per-key table (so the operator can list/revoke issued
// keys) + metered 2%-on-rentals billing. Today the key is stateless + bounded
// by its 90-day TTL.

"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { mintRentalKey, RENTAL_KEY_DEFAULT_TTL_SECONDS } from "@/lib/marketplace/rental-token";
import { getRentalSigningSecret } from "@/lib/marketplace/rental-secret";

export type GenerateRentalKeyResult =
  | { ok: true; key: string; endpoint: string; expiresInDays: number }
  | { ok: false; error: string };

/**
 * Mint a rental key for the caller's org scoped to a published agent listing.
 * Returns the key + the MCP endpoint URL so the UI can show the real config
 * snippet. Org-guarded; only resolves PUBLISHED kind:'agent' listings.
 */
export async function generateAgentRentalKeyAction(input: {
  slug: string;
}): Promise<GenerateRentalKeyResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const slug = String(input?.slug ?? "").trim();
  if (!slug) return { ok: false, error: "Listing slug is required." };

  // Confirm the slug is a real, published agent listing before minting a key
  // for it (don't hand out keys for non-existent / unpublished agents).
  const [listing] = await db
    .select({ id: marketplaceListings.id, kind: marketplaceListings.kind })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!listing || listing.kind !== "agent") {
    return { ok: false, error: "Agent listing not found." };
  }

  let secret: string;
  try {
    secret = getRentalSigningSecret();
  } catch {
    return { ok: false, error: "Rental key signing is not configured on this deployment." };
  }

  const key = mintRentalKey({ slug, renterOrgId: orgId, secret });
  const endpoint = buildEndpointUrl(slug);

  return {
    ok: true,
    key,
    endpoint,
    expiresInDays: Math.round(RENTAL_KEY_DEFAULT_TTL_SECONDS / 86400),
  };
}

function buildEndpointUrl(slug: string): string {
  // Prefer the configured public app URL; fall back to the production host the
  // listing UI already advertises in its placeholder snippet.
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com").replace(/\/$/, "");
  return `${base}/api/v1/agents/${slug}/mcp`;
}
