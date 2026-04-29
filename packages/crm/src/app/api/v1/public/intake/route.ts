import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, intakeForms, intakeSubmissions, organizations } from "@/db/schema";
import type { IntakeFormField } from "@/db/schema/intake-forms";
import { emitSeldonEvent } from "@/lib/events/bus";

/**
 * POST /api/v1/public/intake
 *
 * The HTTP endpoint the C5 intake renderer's vanilla-JS client posts
 * to on Submit. Stores the answer payload in `intake_submissions` for
 * the workspace operator to review later (Inbox, exports, automation
 * triggers, etc.).
 *
 * Request body:
 *   {
 *     orgSlug: string,
 *     formSlug?: string,         // default: "intake"
 *     answers: Record<string, unknown>,
 *     workspace?: string         // C5 client includes the workspace
 *                                // name for diagnostic logs
 *   }
 *
 * Auth: anonymous. We resolve the org by slug and look up the form by
 * (orgId, formSlug); if either is missing we return 404 without
 * leaking which.
 *
 * P0-1 (operator-journey audit): when the answers carry an email, we
 * look up an existing contact for that workspace and either link the
 * submission to it OR auto-create a fresh contact (status=lead,
 * source=intake) and link to that. Mirrors the booking auto-create
 * pattern (`submitPublicBookingAction`) so operators see new intake
 * submissions surface in /contacts immediately.
 */

type SubmitBody = {
  orgSlug?: unknown;
  formSlug?: unknown;
  answers?: unknown;
  workspace?: unknown;
};

export async function POST(request: Request) {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orgSlug = typeof body.orgSlug === "string" ? body.orgSlug.trim() : "";
  const formSlug =
    typeof body.formSlug === "string" && body.formSlug.trim().length > 0
      ? body.formSlug.trim()
      : "intake";
  const answers =
    body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>)
      : null;

  if (!orgSlug || !answers) {
    return NextResponse.json(
      { error: "orgSlug and answers are required." },
      { status: 400 }
    );
  }

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const [form] = await db
    .select({
      id: intakeForms.id,
      isActive: intakeForms.isActive,
      fields: intakeForms.fields,
    })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, org.id), eq(intakeForms.slug, formSlug)))
    .limit(1);

  if (!form || !form.isActive) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  // Pull contact-shaped fields out of the answers blob using the form's
  // field schema. Type-based first (the cleanest signal — `email` /
  // `phone` types map straight through), id-based fallback for the
  // common conventional ids (fullName/name/firstName).
  const formFields = (Array.isArray(form.fields) ? form.fields : []) as IntakeFormField[];
  const extracted = extractContactFromAnswers(answers, formFields);

  let contactId: string | null = null;
  let contactCreated = false;
  if (extracted.email) {
    const [existingContact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, org.id), eq(contacts.email, extracted.email)))
      .limit(1);
    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const [createdContact] = await db
        .insert(contacts)
        .values({
          orgId: org.id,
          firstName: extracted.firstName ?? extracted.email,
          lastName: extracted.lastName ?? null,
          email: extracted.email,
          phone: extracted.phone ?? null,
          status: "lead",
          source: "intake",
        })
        .returning({ id: contacts.id });
      contactId = createdContact?.id ?? null;
      contactCreated = Boolean(contactId);
    }
  }

  await db.insert(intakeSubmissions).values({
    orgId: org.id,
    formId: form.id,
    contactId: contactId ?? null,
    data: answers,
  });

  // Best-effort event emit — fire-and-forget so a Brain subscriber
  // crash never blocks the public submission response.
  if (contactCreated && contactId) {
    void emitSeldonEvent("contact.created", { contactId }, { orgId: org.id }).catch(() => undefined);
  }
  void emitSeldonEvent(
    "intake.submitted",
    { formId: form.id, contactId: contactId ?? null },
    { orgId: org.id }
  ).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

interface ExtractedContact {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Best-effort field extraction from an intake answers blob. Keep this
 * defensive — operators ship arbitrary form schemas, and we'd rather
 * silently miss a field than throw on submit and lose the data.
 */
function extractContactFromAnswers(
  answers: Record<string, unknown>,
  fields: IntakeFormField[]
): ExtractedContact {
  const result: ExtractedContact = { firstName: null, lastName: null, email: null, phone: null };

  // Type-based detection (most reliable).
  for (const field of fields) {
    const raw = answers[field.key];
    if (raw == null) continue;
    const value = typeof raw === "string" ? raw.trim() : String(raw);
    if (!value) continue;
    if (field.type === "email" && !result.email) result.email = value.toLowerCase();
    else if (field.type === "phone" && !result.phone) result.phone = value;
  }

  // Conventional-id fallback. Walk well-known field-key conventions
  // (fullName, firstName, lastName, email, phone, etc.) — this is what
  // every template in `skills/templates/*.json` uses.
  const KEY_HINTS = {
    email: ["email", "emailAddress", "email_address", "contactEmail"],
    phone: ["phone", "phoneNumber", "phone_number", "tel", "mobile"],
    fullName: ["fullName", "full_name", "name"],
    firstName: ["firstName", "first_name"],
    lastName: ["lastName", "last_name"],
  };

  const pickFirst = (keys: string[]) => {
    for (const key of keys) {
      const raw = answers[key];
      if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
    }
    return null;
  };

  if (!result.email) {
    const v = pickFirst(KEY_HINTS.email);
    if (v) result.email = v.toLowerCase();
  }
  if (!result.phone) {
    result.phone = pickFirst(KEY_HINTS.phone);
  }
  const fullName = pickFirst(KEY_HINTS.fullName);
  if (fullName) {
    // Naive "first last" split — fine for North America. A multi-token
    // name's tail words go to lastName so "Anne-Marie de la Cruz"
    // round-trips at the contact level.
    const parts = fullName.split(/\s+/);
    result.firstName = parts[0] ?? null;
    result.lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  } else {
    result.firstName = pickFirst(KEY_HINTS.firstName);
    result.lastName = pickFirst(KEY_HINTS.lastName);
  }

  return result;
}
