import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const rows = await db.select().from(activities).where(eq(activities.orgId, guard.orgId));
  return NextResponse.json({ data: rows });
}
