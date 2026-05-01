// May 1, 2026 — operator-signup lead ingestion.
//
// Posts a contact into SeldonFrame's own CRM workspace whenever a
// human builder hands over their email after create_workspace. Closes
// the onboarding loop: every workspace creation becomes a tracked
// relationship in SeldonFrame's pipeline (status = "lead").
//
// Design choices:
//   - **Anonymous**: no auth required. Bearer tokens scope to the
//     newly-minted workspace, not to SeldonFrame's ops workspace, and
//     the operator hasn't signed up for anything yet.
//   - **Idempotent on email**: a second call with the same email +
//     same source_workspace_id updates the existing contact instead
//     of creating duplicates.
//   - **Configurable target**: SELDONFRAME_OPS_WORKSPACE_ID env var
//     points at SeldonFrame's own workspace. Missing env = no-op
//     success (so we never block onboarding even if ops is misconfigured).
//   - **Rate-limited**: 10 / hour / IP to deter spammers.

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { trackEvent } from "@/lib/analytics/track";

type LeadBody = {
  email?: unknown;
  name?: unknown;
  /** Slug or id of the workspace the operator just created — saved on
   *  the contact's customFields so we can tell which workspace this
   *  lead spun up. */
  source_workspace_id?: unknown;
  source_workspace_slug?: unknown;
  /** Optional free-text source qualifier (e.g. "mcp-onboarding"). */
  source?: unknown;
};

function resolveRequestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function splitName(full: string): { firstName: string; lastName: string | null } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: "Operator", lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();

  const body = (await request.json().catch(() => ({}))) as LeadBody;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "`email` is required (must be a valid address)." },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sourceWorkspaceId =
    typeof body.source_workspace_id === "string"
      ? body.source_workspace_id.trim()
      : null;
  const sourceWorkspaceSlug =
    typeof body.source_workspace_slug === "string"
      ? body.source_workspace_slug.trim()
      : null;
  const sourceTag =
    typeof body.source === "string" && body.source.trim().length > 0
      ? body.source.trim()
      : "mcp-onboarding";

  const ip = resolveRequestIp(request.headers);
  const allowed = await checkRateLimit(`operator-signup:${ip}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    logEvent(
      "operator_signup_rate_limited",
      { ip, email },
      { request, status: 429 }
    );
    return NextResponse.json(
      {
        error:
          "Too many sign-ups from this IP. Try again later or set SELDONFRAME_API_KEY.",
      },
      { status: 429 }
    );
  }

  const opsWorkspaceId = process.env.SELDONFRAME_OPS_WORKSPACE_ID?.trim() || "";

  if (!opsWorkspaceId) {
    // Soft-success when SeldonFrame's own ops workspace isn't
    // configured. We still log so operators can see the missing-env
    // signal without onboarding breaking.
    logEvent(
      "operator_signup_no_ops_workspace",
      { email },
      { request, status: 200 }
    );
    return NextResponse.json(
      {
        ok: true,
        recorded: false,
        reason: "ops_workspace_not_configured",
      },
      { status: 200 }
    );
  }

  const { firstName, lastName } = splitName(name);

  // Idempotent on email + ops-workspace. A second call with the same
  // address updates the existing contact (refreshes customFields with
  // the latest source_workspace_id) instead of producing duplicates.
  const existing = await db
    .select({
      id: contacts.id,
      customFields: contacts.customFields,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, opsWorkspaceId),
        eq(contacts.email, email)
      )
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  const customFields: Record<string, unknown> = {
    ...((existing?.customFields ?? {}) as Record<string, unknown>),
    operator_signup_at: new Date().toISOString(),
  };
  if (sourceWorkspaceId) customFields.source_workspace_id = sourceWorkspaceId;
  if (sourceWorkspaceSlug) customFields.source_workspace_slug = sourceWorkspaceSlug;

  let contactId: string;
  if (existing) {
    await db
      .update(contacts)
      .set({
        firstName: firstName || (existing.id ? undefined : "Operator") || "Operator",
        lastName: lastName ?? null,
        customFields,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing.id));
    contactId = existing.id;
  } else {
    const [created] = await db
      .insert(contacts)
      .values({
        orgId: opsWorkspaceId,
        firstName: firstName || "Operator",
        lastName: lastName ?? null,
        email,
        status: "lead",
        source: sourceTag,
        customFields,
      })
      .returning({ id: contacts.id });
    if (!created) {
      return NextResponse.json(
        { error: "Failed to create lead." },
        { status: 500 }
      );
    }
    contactId = created.id;
  }

  logEvent(
    "operator_signup_recorded",
    {
      email,
      contact_id: contactId,
      source_workspace_id: sourceWorkspaceId,
      duplicate: Boolean(existing),
    },
    { request, status: 200 }
  );

  // May 1, 2026 — Measurement Layer 2. Captures the moment the
  // operator hands over their email so we can compute "of all
  // workspaces created today, what % gave us their email?"
  // Attached to the source workspace (not the SeldonFrame ops
  // workspace) so funnel queries align with workspace_created.
  trackEvent(
    "operator_email_collected",
    {
      has_name: Boolean(name),
      lead_recorded: true,
      duplicate: Boolean(existing),
      lead_id: contactId,
    },
    { orgId: sourceWorkspaceId ?? null }
  );

  return NextResponse.json(
    {
      ok: true,
      recorded: true,
      lead_id: contactId,
      duplicate: Boolean(existing),
    },
    { status: 200 }
  );
}
