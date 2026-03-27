import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { intakeForms, intakeSubmissions } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const rows = await db
    .select()
    .from(intakeSubmissions)
    .where(and(eq(intakeSubmissions.orgId, guard.orgId), eq(intakeSubmissions.formId, id)));

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const body = await request.json();

  const [form] = await db
    .select()
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, guard.orgId), eq(intakeForms.id, id)))
    .limit(1);

  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const [row] = await db
    .insert(intakeSubmissions)
    .values({
      orgId: guard.orgId,
      formId: form.id,
      data: body,
    })
    .returning();

  return NextResponse.json({ data: row }, { status: 201 });
}
