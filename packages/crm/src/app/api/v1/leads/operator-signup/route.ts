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
//
// 2026-07-02 — production 500 fix. Root cause: SELDONFRAME_OPS_WORKSPACE_ID
// resolved (at request time, in the then-current deployment) to a
// well-formed UUID that did NOT correspond to any row in `organizations`
// (Postgres 23503 foreign_key_violation on contacts_org_id_organizations_id_fk
// — confirmed via prod Vercel runtime logs). The route trusted the env var
// as a live org id with zero existence check and no try/catch around the
// insert, so a single bad/stale value 500'd every real prospect's signup.
// Fix is two-layered:
//   1. **Root cause**: verify the configured org actually exists before
//      using it (self-heals exactly this failure mode — an env var
//      pointing at a deleted/never-created/rotated-away org now behaves
//      identically to "not configured" instead of throwing).
//   2. **Defense in depth**: the whole read/write section is wrapped in
//      try/catch. ANY DB error here (this FK case, a transient Neon
//      hiccup, future schema changes, etc.) logs loudly server-side and
//      still returns 200 `recorded:false` — this is a marketing lead-
//      capture path, so a CRM-side hiccup must never bounce a real
//      prospect. Mirrors the existing ops_workspace_not_configured
//      soft-200 branch below, which already established this shape.

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
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

  try {
    // Root-cause guard (2026-07-02): the env var can be a syntactically
    // valid UUID that doesn't correspond to any organization row (rotated
    // away, never created, deleted). Treat that identically to "not
    // configured" instead of letting the FK violation on the insert below
    // throw an unhandled 500. Cheap indexed PK lookup — negligible cost
    // on the happy path.
    const [opsOrg] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, opsWorkspaceId))
      .limit(1);

    if (!opsOrg) {
      logEvent(
        "operator_signup_ops_workspace_not_found",
        { email, ops_workspace_id: opsWorkspaceId },
        { request, status: 200, severity: "error" }
      );
      return NextResponse.json(
        {
          ok: true,
          recorded: false,
          reason: "ops_workspace_not_found",
        },
        { status: 200 }
      );
    }

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
        throw new Error("Insert returned no row.");
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
  } catch (error) {
    // Defense in depth: this is a marketing lead-capture path — a CRM-side
    // DB hiccup (this FK case, a transient Neon error, a future schema
    // drift) must never bounce a real prospect's signup. Log loudly with
    // the full error so it's visible in Vercel logs, then soft-succeed.
    const message = error instanceof Error ? error.message : String(error);
    logEvent(
      "operator_signup_insert_failed",
      {
        email,
        ops_workspace_id: opsWorkspaceId,
        error: message,
        stack: error instanceof Error ? error.stack?.slice(0, 800) : null,
      },
      { request, status: 200, severity: "error" }
    );
    return NextResponse.json(
      {
        ok: true,
        recorded: false,
        reason: "lead_capture_failed",
      },
      { status: 200 }
    );
  }
}
