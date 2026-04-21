import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { getLandingPage, updateLandingPageFromApi } from "@/lib/landing/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const row = await getLandingPage(guard.orgId, id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const body = (await request.json()) as {
    title?: unknown;
    puckData?: unknown;
  };

  const result = await updateLandingPageFromApi({
    orgId: guard.orgId,
    pageId: id,
    title: typeof body.title === "string" ? body.title : undefined,
    puckData: "puckData" in body ? body.puckData : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, issues: result.issues },
      { status: result.reason === "not_found" ? 404 : 422 }
    );
  }

  return NextResponse.json({ data: result.page });
}
