import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { emails, users } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { sendEmailFromApi } from "@/lib/emails/api";

async function getOrgOwnerUserId(orgId: string) {
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId)).limit(1);
  return owner?.id ?? null;
}

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const rows = await db
    .select({
      id: emails.id,
      contactId: emails.contactId,
      subject: emails.subject,
      toEmail: emails.toEmail,
      fromEmail: emails.fromEmail,
      status: emails.status,
      provider: emails.provider,
      openCount: emails.openCount,
      clickCount: emails.clickCount,
      sentAt: emails.sentAt,
      createdAt: emails.createdAt,
    })
    .from(emails)
    .where(eq(emails.orgId, guard.orgId))
    .orderBy(desc(emails.createdAt))
    .limit(limit);

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    to?: unknown;
    subject?: unknown;
    body?: unknown;
    contactId?: unknown;
    provider?: unknown;
  };

  if (typeof body.to !== "string" || !body.to.trim()) {
    return NextResponse.json({ error: "to is required" }, { status: 400 });
  }
  if (typeof body.subject !== "string" || !body.subject.trim()) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const userId = await getOrgOwnerUserId(guard.orgId);
  if (!userId) {
    return NextResponse.json({ error: "No user available to send as" }, { status: 422 });
  }

  const result = await sendEmailFromApi({
    orgId: guard.orgId,
    userId,
    contactId: typeof body.contactId === "string" ? body.contactId : null,
    toEmail: body.to,
    subject: body.subject,
    body: body.body,
    provider: typeof body.provider === "string" ? body.provider : null,
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
