import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { publishLandingPageFromApi } from "@/lib/landing/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as { published?: unknown };
  const published = body.published !== false; // default: publish

  const { id } = await params;
  const result = await publishLandingPageFromApi({
    orgId: guard.orgId,
    pageId: id,
    published,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }
  return NextResponse.json({ data: result.page });
}
