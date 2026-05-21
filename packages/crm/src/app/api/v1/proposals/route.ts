// packages/crm/src/app/api/v1/proposals/route.ts
// 2026-05-21 — Phase E: POST no longer extracts the prospect's soul from a
// URL, provisions a preview workspace, or calls Claude. The operator passes
// all fields directly. workspace_id is OPTIONAL — null means "no workspace
// bundled" (external billing). HTML is composed deterministically via
// composeProposalHtml. GET is unchanged.
// Spec: §"Proposal creation" (Phase E).

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { createProposal } from "@/lib/proposals/create";
import { composeProposalHtml } from "@/lib/proposals/compose-html";
import { countProposalsThisMonth, evaluateProposalQuota } from "@/lib/proposals/check-tier-quota";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposals/generate-html";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = await db
    .select()
    .from(proposals)
    .where(eq(proposals.agencyOrgId, user.orgId))
    .orderBy(desc(proposals.createdAt))
    .limit(100);

  return NextResponse.json({ proposals: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const {
    workspace_id,
    prospect_name,
    prospect_email,
    prospect_first_name,
    prospect_phone,
    monthly_price_cents,
    setup_fee_cents,
    email_subject,
    email_body,
    intro_text,
    timeline_text,
    terms_text,
    scope_items,
  } = body as {
    workspace_id?: string | null;
    prospect_name?: string;
    prospect_email?: string;
    prospect_first_name?: string;
    prospect_phone?: string;
    monthly_price_cents?: number;
    setup_fee_cents?: number;
    email_subject?: string;
    email_body?: string;
    intro_text?: string;
    timeline_text?: string;
    terms_text?: string;
    scope_items?: { label: string; description?: string }[];
  };

  // Validate required fields
  if (!prospect_name || typeof prospect_name !== "string" || !prospect_name.trim()) {
    return NextResponse.json({ error: "prospect_name_required" }, { status: 400 });
  }
  if (!prospect_email || typeof prospect_email !== "string" || !prospect_email.trim()) {
    return NextResponse.json({ error: "prospect_email_required" }, { status: 400 });
  }
  if (typeof monthly_price_cents !== "number" || monthly_price_cents < 5000) {
    return NextResponse.json(
      { error: "monthly_price_cents_required_min_5000" },
      { status: 400 },
    );
  }

  const setupFeeCents =
    typeof setup_fee_cents === "number"
      ? Math.max(0, Math.min(1_000_000, Math.floor(setup_fee_cents)))
      : 0;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // Tier gate
  const tier = user.planId ?? "free";
  const usedThisMonth = await countProposalsThisMonth(user.orgId);
  const quota = evaluateProposalQuota({ tier, proposalsThisMonth: usedThisMonth });
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quota.reason, capacity: quota.capacity },
      { status: 402 },
    );
  }

  // Validate workspace_id if provided — must belong to this user's org
  let resolvedWorkspaceId: string | null = null;
  if (workspace_id && typeof workspace_id === "string" && workspace_id.trim()) {
    const { listManagedOrganizationsForUser } = await import("@/lib/billing/orgs");
    const managed = await listManagedOrganizationsForUser(user.id);
    const found = managed.find((ws) => ws.id === workspace_id);
    if (!found) {
      return NextResponse.json(
        { error: "workspace_not_found_or_unauthorized" },
        { status: 403 },
      );
    }
    resolvedWorkspaceId = workspace_id;
  }

  // Resolve agency template
  const agencyProfile = user.agencyProfile ?? {};
  const agencyName = (agencyProfile as { name?: string }).name ?? user.name;
  const agencyBrandColor = (agencyProfile as { brand_color?: string }).brand_color ?? "#0ea5e9";
  const agencyTemplate =
    (agencyProfile as { proposalTemplate?: typeof DEFAULT_PROPOSAL_TEMPLATE }).proposalTemplate ??
    DEFAULT_PROPOSAL_TEMPLATE;

  // Resolve scope items — use provided array or derive from template
  const resolvedScopeItems: { label: string; description?: string }[] =
    Array.isArray(scope_items) && scope_items.length > 0
      ? scope_items
      : agencyTemplate.scopeCopy
          .split(",")
          .map((item) => ({ label: item.trim() }))
          .filter((item) => item.label.length > 0);

  // Compose HTML deterministically — no LLM call
  const generatedHtml = composeProposalHtml({
    prospectName: prospect_name.trim(),
    prospectFirstName: prospect_first_name?.trim() || null,
    monthlyPriceCents: monthly_price_cents,
    setupFeeCents,
    scopeItems: resolvedScopeItems,
    agencyTemplate,
    introOverride: intro_text?.trim() || null,
    timelineOverride: timeline_text?.trim() || null,
    termsOverride: terms_text?.trim() || null,
    brandColor: agencyBrandColor,
  });

  const proposal = await createProposal({
    agencyOrgId: user.orgId,
    createdByUserId: user.id,
    prospectName: prospect_name.trim(),
    prospectEmail: prospect_email.trim(),
    prospectFirstName: prospect_first_name?.trim() || null,
    prospectPhone: prospect_phone?.trim() || null,
    scopeItems: resolvedScopeItems,
    agencyName,
    agencyBrandColor,
    template: agencyTemplate,
    monthlyPriceCents: monthly_price_cents,
    setupFeeCents,
    previewWorkspaceId: resolvedWorkspaceId,
    emailSubject: email_subject?.trim() || null,
    emailBody: email_body?.trim() || null,
    introText: intro_text?.trim() || null,
    timelineText: timeline_text?.trim() || null,
    termsText: terms_text?.trim() || null,
    generatedHtml,
  });

  return NextResponse.json({ proposal });
}
