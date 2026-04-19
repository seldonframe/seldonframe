import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  bookings,
  contacts,
  intakeForms,
  intakeSubmissions,
  organizations,
} from "@/db/schema";
import { resolveV1Identity, userCanWriteWorkspace } from "@/lib/auth/v1-identity";

// Returns a structured read-only snapshot of workspace state for Claude Code
// to reason over. Pure DB read — zero LLM calls, zero Anthropic dependency.
// This is the replacement for the old /brain/query endpoint.
//
// The caller (Claude Code in the MCP session) is expected to do its own
// reasoning: "given this state, what's the next best action?" — then call
// typed endpoints (/landing/update, /intake/customize, etc.) to apply changes.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const { id } = await params;
  const workspaceId = id.trim();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Workspace id is required." },
      { status: 400 }
    );
  }

  if (identity.kind === "workspace") {
    if (identity.orgId !== workspaceId) {
      return NextResponse.json(
        { error: "Bearer token does not authorize this workspace." },
        { status: 403 }
      );
    }
  } else {
    // User identity: verify the user manages this workspace before exposing
    // its state. Owners, parent users, primary-org users, and explicit
    // org_members all pass.
    const canRead = await userCanWriteWorkspace(identity.userId, workspaceId);
    if (!canRead) {
      return NextResponse.json(
        { error: "You do not have access to this workspace." },
        { status: 403 }
      );
    }
  }

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      ownerId: organizations.ownerId,
      plan: organizations.plan,
      enabledBlocks: organizations.enabledBlocks,
      theme: organizations.theme,
      soul: organizations.soul,
      soulCompletedAt: organizations.soulCompletedAt,
      settings: organizations.settings,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const [contactCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.orgId, workspaceId));
  const [bookingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(eq(bookings.orgId, workspaceId), sql`${bookings.status} != 'template'`)
    );
  const [templateBookingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(eq(bookings.orgId, workspaceId), sql`${bookings.status} = 'template'`)
    );
  const [intakeFormCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, workspaceId));
  const [submissionCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.orgId, workspaceId));

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const recentSeldonItEvents = Array.isArray(settings.seldon_it_events)
    ? (settings.seldon_it_events as Array<Record<string, unknown>>).slice(-10)
    : [];
  const recentEvents = Array.isArray(settings.events)
    ? (settings.events as Array<Record<string, unknown>>).slice(-10)
    : [];

  const baseDomain = process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const origin = `https://${org.slug}.${baseDomain}`;

  return NextResponse.json({
    ok: true,
    workspace: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      tier: org.plan,
      owned: !!org.ownerId,
      created_at: org.createdAt.toISOString(),
    },
    soul: {
      submitted: !!org.soul,
      completed_at: org.soulCompletedAt?.toISOString() ?? null,
      data: org.soul ?? null,
    },
    theme: org.theme,
    blocks: {
      enabled: org.enabledBlocks ?? [],
      settings: (settings.blocks ?? {}) as Record<string, unknown>,
    },
    entities: {
      contacts: Number(contactCount?.count ?? 0),
      bookings_real: Number(bookingCount?.count ?? 0),
      bookings_template: Number(templateBookingCount?.count ?? 0),
      intake_forms: Number(intakeFormCount?.count ?? 0),
      intake_submissions: Number(submissionCount?.count ?? 0),
    },
    recent_activity: {
      seldon_it: recentSeldonItEvents,
      events: recentEvents,
    },
    public_urls: {
      home: origin,
      book: `${origin}/book`,
      intake: `${origin}/intake`,
    },
  });
}
