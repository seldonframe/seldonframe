import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { landingPages } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";

export async function GET(_request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const orgId = await getOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await params;

  const [page] = await db
    .select()
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)))
    .limit(1);

  if (!page) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: page });
}

export async function PUT(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await params;
  const body = (await request.json()) as { puckData?: Record<string, unknown> | null };

  const [updated] = await db
    .update(landingPages)
    .set({
      puckData: body.puckData ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}
