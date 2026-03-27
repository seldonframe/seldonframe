import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const [row] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.orgId, guard.orgId), eq(deals.id, id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: row });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = await request.json();
  const { id } = await params;

  const [row] = await db
    .update(deals)
    .set({
      title: body.title,
      stage: body.stage,
      probability: body.probability,
      value: body.value ? String(body.value) : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(deals.orgId, guard.orgId), eq(deals.id, id)))
    .returning();

  return NextResponse.json({ data: row });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  await db.delete(deals).where(and(eq(deals.orgId, guard.orgId), eq(deals.id, id)));
  return NextResponse.json({ success: true });
}
