import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, guard.orgId), eq(contacts.id, id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: row });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const body = await request.json();

  const [row] = await db
    .update(contacts)
    .set({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      status: body.status,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.orgId, guard.orgId), eq(contacts.id, id)))
    .returning();

  return NextResponse.json({ data: row });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;

  await db.delete(contacts).where(and(eq(contacts.orgId, guard.orgId), eq(contacts.id, id)));
  return NextResponse.json({ success: true });
}
