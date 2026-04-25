import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, formSubmissions } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";

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

  const response = NextResponse.json({ success: true, score });
  response.cookies.set("sf_score", String(score), {
    path: "/",
    maxAge: 60 * 60,
    sameSite: "lax",
  });

  return response;
}
