import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { soulSources } from "@/db/schema";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await db
    .select()
    .from(soulSources)
    .where(eq(soulSources.orgId, session.user.orgId))
    .orderBy(desc(soulSources.createdAt));

  return NextResponse.json(sources);
}

export async function DELETE(req: Request) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  assertWritable();

  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { sourceId?: string };
  const sourceId = String(body.sourceId ?? "").trim();

  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  }

  await db
    .delete(soulSources)
    .where(and(eq(soulSources.id, sourceId), eq(soulSources.orgId, session.user.orgId)));

  return NextResponse.json({ success: true });
}
