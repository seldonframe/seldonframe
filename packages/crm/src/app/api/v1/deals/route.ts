import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deals, pipelines } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const rows = await db.select().from(deals).where(eq(deals.orgId, guard.orgId));
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = await request.json();
  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.orgId, guard.orgId), eq(pipelines.isDefault, true)))
    .limit(1);

  if (!pipeline) return NextResponse.json({ error: "No pipeline" }, { status: 400 });

  const [row] = await db
    .insert(deals)
    .values({
      orgId: guard.orgId,
      contactId: body.contactId,
      pipelineId: pipeline.id,
      title: body.title,
      value: String(body.value ?? 0),
      stage: body.stage ?? "New",
      probability: Number(body.probability ?? 0),
    })
    .returning();

  return NextResponse.json({ data: row }, { status: 201 });
}
