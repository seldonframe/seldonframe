import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, formSubmissions, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { trackEvent } from "@/lib/analytics/track";
import { logBrainEvent } from "@/lib/analytics/brain";
import { resolveSubmitOrg } from "@/lib/forms/resolve-submit-org";
import {
  resolveWorkspaceSlugFromRequest,
  resolveWorkspaceSlugFromRequestWithCustomDomains,
} from "@/lib/workspace/host-to-slug";

type SubmitBody = {
  formName?: string;
  data?: Record<string, unknown>;
  orgId?: string;
};

function detectEmail(data: Record<string, unknown>) {
  const candidates = ["email", "Email", "emailAddress"];
  for (const key of candidates) {
    const value = data[key];
    if (typeof value === "string" && value.includes("@")) {
      return value.trim();
    }
  }
  return null;
}

function detectName(data: Record<string, unknown>, email: string | null) {
  const candidates = ["name", "Name", "Full Name", "fullName"];
  for (const key of candidates) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  if (email) {
    return email.split("@")[0] || "Lead";
  }

  return "Lead";
}

function calculateScore(data: Record<string, unknown>) {
  let totalScore = 0;
  const scoredFields: Record<string, number> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null && "points" in value) {
      const points = Number((value as { points?: unknown }).points);
      if (Number.isFinite(points)) {
        totalScore += points;
        scoredFields[key] = points;
      }
    }
  }

  return { totalScore, scoredFields };
}

/**
 * Resolve the workspace org id from the VERIFIED request host — the
 * `<slug>.app.seldonframe.com` subdomain or a verified custom domain in
 * workspace_domains. Returns null when the host doesn't map to a workspace
 * (e.g. the bare app domain, or an in-dashboard editor preview). Mirrors the
 * host-resolution in /api/v1/public/intake so the public landing form keeps
 * working: those pages are served on the workspace subdomain, so the host
 * resolves to the same org the page was rendered for.
 */
async function resolveOrgIdFromRequestHost(request: Request): Promise<string | null> {
  const customDomainSlug = await resolveWorkspaceSlugFromRequestWithCustomDomains(request);
  const slug = customDomainSlug || resolveWorkspaceSlugFromRequest(request);
  if (!slug) return null;

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org?.id ?? null;
}

export async function POST(request: Request) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  assertWritable();

  const body = (await request.json()) as SubmitBody;
  const data = body.data && typeof body.data === "object" ? body.data : {};

  // ------------------------------------------------------------------
  // Authoritative-org resolution (security audit 2026-06-28, FIX 3).
  //
  // This is a PUBLIC route that writes a contact AND emits
  // `lead.created` (which fires the org's speed-to-lead agent on its
  // own Twilio/Resend creds). The previous `body.orgId || getOrgId()`
  // trusted a caller-supplied org id, letting any unauthenticated
  // caller write into / bill another tenant.
  //
  // The authority is now the VERIFIED request host (mirrors
  // /api/v1/public/intake) or an authenticated operator session — never
  // a raw body.orgId. body.orgId is only honored as a confirmation that
  // must MATCH the authority (the legit Puck landing form's body.orgId
  // always equals the org its subdomain resolves to). No verified org →
  // reject (no write, no emit). See resolveSubmitOrg for the decision.
  // ------------------------------------------------------------------
  const hostOrgId = await resolveOrgIdFromRequestHost(request);
  const sessionOrgId = hostOrgId ? null : await getOrgId();
  const bodyOrgId = typeof body.orgId === "string" ? body.orgId : null;

  const resolved = resolveSubmitOrg({ hostOrgId, sessionOrgId, bodyOrgId });
  if (!resolved.ok) {
    console.error(
      JSON.stringify({
        event: "forms_submit_rejected",
        reason: resolved.reason,
        host_header: request.headers.get("host"),
        x_forwarded_host: request.headers.get("x-forwarded-host"),
        body_org_present: Boolean(bodyOrgId),
      }),
    );
    // Generic message — don't reveal whether the org exists or which
    // check failed.
    return NextResponse.json({ error: "Form submission not allowed." }, { status: 403 });
  }

  const orgId = resolved.orgId;

  const formName = String(body.formName ?? "Puck Form");
  const { totalScore: score, scoredFields } = calculateScore(data);
  const email = detectEmail(data);
  const displayName = detectName(data, email);

  await db.insert(formSubmissions).values({
    orgId,
    formName,
    data,
    score,
    scoredFields,
    submittedAt: new Date(),
  });

  let contactId: string | null = null;

  if (email) {
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)))
      .limit(1);

    if (existing) {
      contactId = existing.id;
      await db
        .update(contacts)
        .set({
          firstName: displayName,
          source: formName,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.orgId, orgId), eq(contacts.id, existing.id)));
    } else {
      const [created] = await db
        .insert(contacts)
        .values({
          orgId,
          firstName: displayName,
          email,
          status: "lead",
          source: formName,
        })
        .returning({ id: contacts.id });

      contactId = created?.id ?? null;

      if (contactId) {
        try {
          await emitSeldonEvent("contact.created", { contactId }, { orgId: orgId });
        } catch {
          // Non-blocking for public form submission path.
        }
      }
    }
  }

  if (contactId) {
    try {
      await emitSeldonEvent("form.submitted", {
        formId: formName,
        contactId,
        data: {
          ...data,
          score,
          scoredFields,
          ...(email ? { email } : {}),
        },
      }, { orgId: orgId });
    } catch {
      // Non-blocking for public form submission path.
    }

    // 2026-06-25 — unified agent model P1 (T4): a public intake submission is a
    // new lead → emit `lead.created` so the speed-to-lead event-agent fires
    // (same canonical slug as lib/forms/actions.ts). orgId rides the payload for
    // the in-memory bus listener. Non-blocking.
    try {
      await emitSeldonEvent("lead.created", {
        contactId,
        orgId: orgId,
        source: "form.submitted",
        formId: formName,
      }, { orgId: orgId });
    } catch {
      // Non-blocking for public form submission path.
    }
  }

  // May 1, 2026 — Measurement Layer 2 + 3.
  //
  // Layer 2: product event for the funnel (intake submission count).
  // Layer 3: Brain "landing → intake" outcome with the landing-page
  // configuration as context, so we can learn which renderer
  // configurations + Soul shapes drive the highest intake-conversion
  // rates per vertical.
  trackEvent(
    "intake_submitted",
    {
      form_name: formName,
      fields_count: Object.keys(data).length,
      has_email: Boolean(email),
      has_phone:
        typeof (data as Record<string, unknown>).phone === "string" ||
        typeof (data as Record<string, unknown>).Phone === "string",
      score,
    },
    { orgId, contactId: contactId ?? undefined }
  );

  // Brain context fetch — best-effort. If the org row read fails the
  // Brain event still logs with `vertical: null` and `context.*: null`,
  // because logBrainEvent itself is fire-and-forget.
  void (async () => {
    try {
      const [org] = await db
        .select({
          soul: organizations.soul,
          settings: organizations.settings,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      const soul = (org?.soul as Record<string, unknown> | null) ?? null;
      const settings = (org?.settings as Record<string, unknown> | null) ?? null;
      const pageTokens =
        (settings?.pageTokens as Record<string, unknown> | null) ?? null;
      const testimonials = soul && Array.isArray(soul.testimonials)
        ? soul.testimonials
        : [];
      logBrainEvent({
        orgId,
        vertical:
          typeof soul?.industry === "string" ? (soul.industry as string) : null,
        eventType: "landing_to_intake",
        context: {
          business_type:
            typeof soul?.business_type === "string"
              ? soul.business_type
              : null,
          page_personality:
            typeof pageTokens?.personality === "string"
              ? pageTokens.personality
              : null,
          page_mode:
            typeof pageTokens?.mode === "string" ? pageTokens.mode : null,
          has_phone_on_page:
            typeof soul?.phone === "string" && (soul.phone as string).length > 0,
          has_testimonials: testimonials.length > 0,
          form_fields_count: Object.keys(data).length,
          form_name: formName,
        },
        outcome: "converted",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[brain] landing_to_intake context fetch failed: ${message}`
      );
    }
  })();

  const response = NextResponse.json({ success: true, score });
  response.cookies.set("sf_score", String(score), {
    path: "/",
    maxAge: 60 * 60,
    sameSite: "lax",
  });

  return response;
}
