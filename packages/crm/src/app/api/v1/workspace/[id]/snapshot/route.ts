import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agents,
  bookings,
  contacts,
  intakeForms,
  intakeSubmissions,
  organizations,
} from "@/db/schema";
import { resolveV1Identity, userCanWriteWorkspace } from "@/lib/auth/v1-identity";
import { buildTierUpsell } from "@/lib/workspace/tier-upsell";
import { summarizeWeeklyHours, type WeeklyHours } from "@/lib/workspace/format-hours";
import { listArchetypes } from "@/lib/agents/archetypes";

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

  // 2026-05-15 — Auto-chatbot info. Returns null when no website-chatbot
  // agent has been created for this workspace yet.
  const [chatbotAgent] = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      status: agents.status,
    })
    .from(agents)
    .where(
      and(eq(agents.orgId, workspaceId), eq(agents.archetype, "website-chatbot")),
    )
    .limit(1);

  // Embed URL pattern matches packages/crm/src/lib/agents/store.ts:
  // https://${WORKSPACE_BASE_DOMAIN}/api/v1/public/agent/${orgSlug}--${agentSlug}/embed.js
  const chatbot = chatbotAgent
    ? (() => {
        const embedUrl = `https://${baseDomain}/api/v1/public/agent/${org.slug}--${chatbotAgent.slug}/embed.js`;
        return {
          agent_id: chatbotAgent.id,
          embed_url: embedUrl,
          embed_snippet: `<script src="${embedUrl}" async></script>`,
          status: chatbotAgent.status as "draft" | "test" | "live",
          name: chatbotAgent.name,
        };
      })()
    : null;

  // 2026-05-15 — Tier info via buildTierUpsell. Always populated; currently
  // hardcoded to "free" until billing-state read is wired in a separate spec.
  const tierBase = buildTierUpsell({
    slug: org.slug,
    currentTier: "free",
  });
  const tierLabelMap = { free: "Free", growth: "Growth", scale: "Scale" } as const;
  const tier = {
    ...tierBase,
    current_tier: tierBase.tier_features.current_tier,
    current_tier_label: tierLabelMap[tierBase.tier_features.current_tier],
  };

  // 2026-05-15 — Booking summary. Pull the org's template-status booking
  // row, read metadata.availability + metadata.duration_minutes.
  const [bookingTemplate] = await db
    .select({
      metadata: bookings.metadata,
    })
    .from(bookings)
    .where(
      and(eq(bookings.orgId, workspaceId), eq(bookings.status, "template")),
    )
    .limit(1);

  const bookingMeta = (bookingTemplate?.metadata ?? {}) as {
    availability?: WeeklyHours;
    duration_minutes?: number;
  };
  const bookingSummary = bookingTemplate
    ? {
        duration_minutes: bookingMeta.duration_minutes ?? 60,
        hours_summary: summarizeWeeklyHours(bookingMeta.availability ?? {}),
      }
    : null;

  // 2026-05-15 — Intake summary. Pull the org's intake form, count fields.
  const [intakeForm] = await db
    .select({
      name: intakeForms.name,
      fields: intakeForms.fields,
    })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, workspaceId))
    .limit(1);

  const intakeSummary = intakeForm
    ? {
        field_count: Array.isArray(intakeForm.fields) ? intakeForm.fields.length : 0,
        title: intakeForm.name ?? null,
      }
    : null;

  const publicUrls = {
    home: origin,
    book: `${origin}/book`,
    intake: `${origin}/intake`,
  };

  // v1.55.0 — Ops-stack URLs + automations callout for the new
  // finalize_workspace summary template. Computed inline rather than
  // stored anywhere — these are derived from existing data.
  const appHost = (process.env.SELDONFRAME_APP_BASE ?? `https://${process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com"}`).replace(/\/$/, "");
  const opsStack = {
    admin_url: `${appHost}/admin/${encodeURIComponent(workspaceId)}`,
    booking_url: publicUrls.book,
    intake_url: publicUrls.intake,
    automations_url: `${appHost}/automations`,
  };

  const availableAutomations = listArchetypes()
    .filter((a) => a.id !== "website-chatbot")
    .map((a) => ({
      id: a.id,
      name: a.name ?? a.id,
      configured: false,
    }));

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
    public_urls: publicUrls,
    chatbot,
    tier,
    booking: bookingSummary,
    intake: intakeSummary,
    ops_stack: opsStack,
    available_automations: availableAutomations,
  });
}
