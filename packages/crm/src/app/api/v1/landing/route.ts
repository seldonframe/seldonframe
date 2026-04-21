import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { createLandingPageFromApi, listLandingPagesForOrg } from "@/lib/landing/api";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const rows = await listLandingPagesForOrg(guard.orgId, limit);
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    title?: unknown;
    slug?: unknown;
    puckData?: unknown;
    published?: unknown;
  };

  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const result = await createLandingPageFromApi({
    orgId: guard.orgId,
    title: body.title,
    slug: typeof body.slug === "string" ? body.slug : undefined,
    puckData: body.puckData,
    published: body.published === true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, issues: result.issues },
      { status: 422 }
    );
  }

  return NextResponse.json({ data: result.page }, { status: 201 });
}
