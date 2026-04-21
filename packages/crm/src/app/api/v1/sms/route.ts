import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { listRecentSms, sendSmsFromApi } from "@/lib/sms/api";

async function getOrgOwnerUserId(orgId: string) {
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId)).limit(1);
  return owner?.id ?? null;
}

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const rows = await listRecentSms(guard.orgId, limit);
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    to?: unknown;
    body?: unknown;
    contactId?: unknown;
    provider?: unknown;
  };

  if (typeof body.to !== "string" || !body.to.trim()) {
    return NextResponse.json({ error: "to is required" }, { status: 400 });
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const userId = await getOrgOwnerUserId(guard.orgId);

  try {
    const result = await sendSmsFromApi({
      orgId: guard.orgId,
      userId,
      contactId: typeof body.contactId === "string" ? body.contactId : null,
      toNumber: body.to,
      body: body.body,
      provider: typeof body.provider === "string" ? body.provider : null,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
