import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, formSubmissions, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { trackEvent } from "@/lib/analytics/track";
import { logBrainEvent } from "@/lib/analytics/brain";

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

export async function POST(request: Request) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  assertWritable();

  const body = (await request.json()) as SubmitBody;
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const orgId = body.orgId || (await getOrgId());

  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

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
