// GET /api/v1/build/blocks/search — find_blocks, the in-prompt registry rail
// (virality pack, Task 4).
//
// An IDE agent mid-build can check "does a block for this already exist?"
// before generating one from scratch — a quick catalog lookup, not a
// storefront browse. This is deliberately UNAUTHENTICATED: it reads only
// PUBLISHED, public marketplace listings (the same rows the /marketplace
// HTML pages and .md twins already serve with no auth), so there is no
// workspace bearer to check and nothing org-scoped to protect. Same posture
// as marketplace.md / llms.txt — public catalog data only.
//
// Caching mirrors the marketplace .md twins' idiom (see
// app/marketplace.md/route.ts): a short browser max-age plus a longer CDN
// s-maxage, so a burst of find_blocks calls from many IDE agents hits the
// edge cache instead of the DB on every request.

import { NextResponse } from "next/server";
import { searchBlocksFromDb } from "@/lib/marketplace/blocks-search";

export const revalidate = 300;

const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;

/** Clamp the `limit` query param into [1, 10], defaulting to 5 for anything
 *  missing, non-numeric, or non-finite. */
function resolveLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(n)));
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = resolveLimit(url.searchParams.get("limit"));

  const blocks = await searchBlocksFromDb({ q, limit });

  return NextResponse.json(
    { blocks },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
}
