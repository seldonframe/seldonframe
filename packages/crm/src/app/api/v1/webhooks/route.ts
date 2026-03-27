import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { webhookEndpoints } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const rows = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.orgId, guard.orgId));
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = await request.json();

  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      orgId: guard.orgId,
      url: body.url,
      events: Array.isArray(body.events) ? body.events : [],
      secret: body.secret,
      isActive: true,
    })
    .returning();

  return NextResponse.json({ data: row }, { status: 201 });
}
