// packages/crm/src/app/api/v1/proposals/route.ts
// 2026-05-19 — Proposal Builder. POST creates a new proposal: extracts
// the prospect's facts from the URL, provisions a preview workspace,
// generates the HTML via Claude, and inserts the proposals row.
// GET lists the authed user's agency proposals.
// Spec: §"Proposal creation".

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { createProposal } from "@/lib/proposals/create";
import { extractBusinessFactsFromUrl } from "@/lib/web-onboarding/markdown-extractor";
import { createFullWorkspace } from "@/lib/workspace/create-full";
import { getOperatorByokAnthropicKey } from "@/lib/web-onboarding/byok-resolver";
import { countProposalsThisMonth, evaluateProposalQuota } from "@/lib/proposals/check-tier-quota";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    prospect_url,
    prospect_email,
    pricing_tier,
    custom_cents,
    setup_fee_cents,
  } = body as {
    prospect_url?: string;
    prospect_email?: string;
    pricing_tier?: string;
    custom_cents?: number;
    setup_fee_cents?: number;
  };

  const setupFeeCents =
    typeof setup_fee_cents === "number"
      ? Math.max(0, Math.min(1_000_000, Math.floor(setup_fee_cents)))
      : 0;

  if (!prospect_url || !prospect_email || !pricing_tier) {
    return NextResponse.json(
      { error: "missing_required_fields" },
      { status: 400 },
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // Tier gate — enforce per-plan proposal creation quotas (open-question #5).
  const tier = user.planId ?? "free";
  const usedThisMonth = await countProposalsThisMonth(user.orgId);
  const quota = evaluateProposalQuota({ tier, proposalsThisMonth: usedThisMonth });
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quota.reason, capacity: quota.capacity },
      { status: 402 },
    );
  }

  // Resolve BYOK key: operator's own Anthropic key first, platform env-var fallback.
  // This mirrors the pattern in /api/v1/web/workspaces/create-from-url/route.ts.
  const byokResult = await getOperatorByokAnthropicKey({ orgId: user.orgId });
  const resolvedApiKey =
    (byokResult.source === "byok" && byokResult.key)
      ? byokResult.key
      : (process.env.ANTHROPIC_API_KEY ?? "");

  // 1. Extract prospect business facts from URL — graceful fallback on failure.
  let facts: Awaited<ReturnType<typeof extractBusinessFactsFromUrl>>;
  try {
    facts = await extractBusinessFactsFromUrl({ url: prospect_url, byokKey: resolvedApiKey });
  } catch (e) {
    console.warn("[proposal-builder] soul extraction failed", e);
    const hostname = new URL(prospect_url).hostname.replace(/^www\./, "");
    facts = {
      business_name: hostname,
      city: "",
      state: "",
      phone: "",
      services: [],
      business_description: `Proposal for ${hostname}`,
    };
  }

  // 2. Provision preview workspace — graceful fallback on failure.
  let workspaceId: string | null = null;
  try {
    const workspace = await createFullWorkspace({
      business_name: facts.business_name,
      city: facts.city,
      state: facts.state,
      phone: facts.phone,
      services: facts.services,
      business_description: facts.business_description,
      email: prospect_email,
      preview_mode: true,
    });
    if (workspace.status === "error" || !workspace.workspace_id) {
      console.warn("[proposal-builder] workspace provisioning failed", workspace.error);
    } else {
      workspaceId = workspace.workspace_id;
    }
  } catch (e) {
    console.warn("[proposal-builder] workspace provisioning failed", e);
  }

  // 3. Create proposal row.
  const agencyProfile = user.agencyProfile ?? {};

  let proposal: Awaited<ReturnType<typeof createProposal>>;
  try {
    proposal = await createProposal({
      agencyOrgId: user.orgId,
      createdByUserId: user.id,
      prospectUrl: prospect_url,
      prospectName: facts.business_name,
      prospectEmail: prospect_email,
      prospectFirstName: null,
      prospectServices: facts.services,
      agencyName: agencyProfile.name ?? user.name,
      agencyBrandColor: agencyProfile.brand_color ?? undefined,
      template: agencyProfile.proposalTemplate,
      pricing:
        pricing_tier === "custom"
          ? { tier: "custom", customCents: custom_cents }
          : { tier: pricing_tier as "starter" | "growth" | "pro" },
      setupFeeCents,
      previewWorkspaceId: workspaceId,
      generateHtml: async (prompt) => {
        if (!resolvedApiKey) {
          throw new Error("html_generation_failed");
        }
        const client = new Anthropic({ apiKey: resolvedApiKey });
        try {
          const response = await client.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 2000,
            system: "You generate HTML sales proposal bodies. Output ONLY HTML.",
            messages: [{ role: "user", content: prompt }],
          });
          const text = response.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { text: string }).text)
            .join("");
          return text.trim();
        } catch (e) {
          console.error("[proposal-builder] Claude HTML generation failed", e);
          throw new Error("html_generation_failed");
        }
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "html_generation_failed") {
      return NextResponse.json({ error: "html_generation_failed" }, { status: 502 });
    }
    throw e;
  }

  return NextResponse.json({ proposal });
}
