import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { resolveLabels } from "@/lib/soul/resolve";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const rows = await db.select().from(contacts).where(eq(contacts.orgId, guard.orgId));

  return NextResponse.json({ data: rows, meta: { labels: resolveLabels(null) } });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = await request.json();

  const [row] = await db
    .insert(contacts)
    .values({
      orgId: guard.orgId,
      firstName: body.firstName ?? "New",
      lastName: body.lastName ?? "",
      email: body.email ?? null,
      status: body.status ?? "lead",
      source: body.source ?? "api",
    })
    .returning();

  return NextResponse.json({ data: row }, { status: 201 });
}
