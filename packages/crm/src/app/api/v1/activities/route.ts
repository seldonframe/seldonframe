import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activities, contacts, deals, users } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export const runtime = "nodejs";

// Activity log read + write. The POST handler was shipped in the
// 2026-04-21 pre-7.c micro-slice after the MCP gap audit v2 flagged
// that agents had no way to log "agent did X" without overwriting
// contacts.notes — which was actively destructive, not merely awkward.
// Strictly append-only; agents compose activity rows and never mutate
// prior ones.

const VALID_TYPES = new Set([
  "task",
  "note",
  "email",
  "sms",
  "call",
  "meeting",
  "stage_change",
  "payment",
  "review_request",
  "agent_action",
]);

function isValidType(value: unknown): value is string {
  return typeof value === "string" && VALID_TYPES.has(value);
}

async function resolveActorUserId(orgId: string) {
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId)).limit(1);
  return owner?.id ?? null;
}

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const rows = await db
    .select()
    .from(activities)
    .where(eq(activities.orgId, guard.orgId))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    contactId?: unknown;
    contact_id?: unknown;
    dealId?: unknown;
    deal_id?: unknown;
    type?: unknown;
    subject?: unknown;
    body?: unknown;
    metadata?: unknown;
    scheduledAt?: unknown;
    scheduled_at?: unknown;
    completedAt?: unknown;
    completed_at?: unknown;
  };

  const contactId = typeof body.contactId === "string" ? body.contactId : typeof body.contact_id === "string" ? body.contact_id : null;
  const dealId = typeof body.dealId === "string" ? body.dealId : typeof body.deal_id === "string" ? body.deal_id : null;
  if (!contactId && !dealId) {
    return NextResponse.json({ error: "one of contact_id or deal_id is required" }, { status: 400 });
  }
  if (!isValidType(body.type)) {
    return NextResponse.json(
      { error: `type must be one of: ${Array.from(VALID_TYPES).join(", ")}` },
      { status: 400 },
    );
  }

  const subject = typeof body.subject === "string" ? body.subject.slice(0, 200) : null;
  const text = typeof body.body === "string" ? body.body.slice(0, 4000) : null;
  if (!subject && !text) {
    return NextResponse.json({ error: "one of subject or body is required" }, { status: 400 });
  }

  const scheduledAt = typeof body.scheduledAt === "string" ? new Date(body.scheduledAt) : typeof body.scheduled_at === "string" ? new Date(body.scheduled_at) : null;
  const completedAt = typeof body.completedAt === "string" ? new Date(body.completedAt) : typeof body.completed_at === "string" ? new Date(body.completed_at) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "scheduled_at must be a valid ISO timestamp" }, { status: 400 });
  }
  if (completedAt && Number.isNaN(completedAt.getTime())) {
    return NextResponse.json({ error: "completed_at must be a valid ISO timestamp" }, { status: 400 });
  }

  if (contactId) {
    const [match] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (!match) return NextResponse.json({ error: "contact not found" }, { status: 404 });
  }
  if (dealId) {
    const [match] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!match) return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  const actorUserId = await resolveActorUserId(guard.orgId);
  if (!actorUserId) {
    return NextResponse.json({ error: "workspace has no user to attribute the activity to" }, { status: 422 });
  }

  const [row] = await db
    .insert(activities)
    .values({
      orgId: guard.orgId,
      contactId,
      dealId,
      userId: actorUserId,
      type: body.type,
      subject,
      body: text,
      metadata: body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : {},
      scheduledAt,
      completedAt,
    })
    .returning();

  return NextResponse.json({ data: row }, { status: 201 });
}
