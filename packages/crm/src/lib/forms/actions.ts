"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, intakeForms, intakeSubmissions, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getSoul } from "@/lib/soul/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { dispatchWebhook } from "@/lib/utils/webhooks";
import { assertWritable } from "@/lib/demo/server";
import type { IntakeFormField } from "@/db/schema/intake-forms";

function toSlug(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "intake-form"
  );
}

function normalizeFields(input: unknown): IntakeFormField[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: IntakeFormField[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const field = item as {
      key?: unknown;
      label?: unknown;
      type?: unknown;
      required?: unknown;
      options?: unknown;
    };

    const label = String(field.label ?? "").trim();

    if (!label) {
      continue;
    }

    const key = String(field.key ?? "").trim() || toSlug(label || "field");
    const type = String(field.type ?? "text").trim() || "text";
    const required = Boolean(field.required);
    const options = Array.isArray(field.options)
      ? field.options.map((option) => String(option).trim()).filter(Boolean)
      : undefined;

    normalized.push({
      key,
      label,
      type,
      required,
      options: options && options.length > 0 ? options : undefined,
    });
  }

  return normalized;
}

export async function listForms() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  return db.select().from(intakeForms).where(eq(intakeForms.orgId, orgId));
}

export async function createSuggestedFormAction() {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const soul = await getSoul();

  if (!soul?.suggestedIntakeForm) {
    throw new Error("Soul intake template missing");
  }

  await db.insert(intakeForms).values({
    orgId,
    name: soul.suggestedIntakeForm.name,
    slug: "default-intake",
    fields: soul.suggestedIntakeForm.fields,
  });
}

export async function createFormAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const name = String(formData.get("name") ?? "").trim() || "New Intake Form";
  const slugInput = String(formData.get("slug") ?? name);
  const slug = toSlug(slugInput);
  const fieldsRaw = String(formData.get("fields") ?? "[]");

  let parsedFields: unknown = [];
  try {
    parsedFields = JSON.parse(fieldsRaw);
  } catch {
    parsedFields = [];
  }

  const fields = normalizeFields(parsedFields);

  const [created] = await db
    .insert(intakeForms)
    .values({
      orgId,
      name,
      slug,
      fields,
    })
    .returning({ id: intakeForms.id });

  return { id: created?.id ?? null };
}

export async function updateFormAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const formId = String(formData.get("formId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const fieldsRaw = String(formData.get("fields") ?? "[]");

  if (!formId || !name || !slugInput) {
    throw new Error("Form ID, name, and slug are required");
  }

  let parsedFields: unknown = [];
  try {
    parsedFields = JSON.parse(fieldsRaw);
  } catch {
    parsedFields = [];
  }

  const fields = normalizeFields(parsedFields);

  await db
    .update(intakeForms)
    .set({
      name,
      slug: toSlug(slugInput),
      fields,
      updatedAt: new Date(),
    })
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, formId)));

  return { success: true };
}

export async function submitPublicIntakeAction({
  orgSlug,
  formSlug,
  data,
}: {
  orgSlug: string;
  formSlug: string;
  data: Record<string, unknown>;
}) {
  assertWritable();

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const [form] = await db
    .select({ id: intakeForms.id, orgId: intakeForms.orgId })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, org.id), eq(intakeForms.slug, formSlug)))
    .limit(1);

  if (!form) {
    throw new Error("Form not found");
  }

  const email = typeof data.email === "string" ? data.email : null;

  let contactId: string | null = null;

  if (email) {
    const [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, form.orgId), eq(contacts.email, email)))
      .limit(1);

    if (existing) {
      contactId = existing.id;
    } else {
      const [created] = await db
        .insert(contacts)
        .values({
          orgId: form.orgId,
          firstName: String(data.name ?? "New"),
          email,
          status: "lead",
        })
        .returning();

      contactId = created?.id ?? null;

      if (created?.id) {
        await emitSeldonEvent("contact.created", { contactId: created.id }, { orgId: form.orgId });
      }
    }
  }

  await db.insert(intakeSubmissions).values({
    orgId: form.orgId,
    formId: form.id,
    contactId,
    data,
  });

  await dispatchWebhook({
    orgId: form.orgId,
    event: "intake.submitted",
    payload: { orgSlug, formSlug, data, contactId },
  });

  if (contactId) {
    await emitSeldonEvent("form.submitted", {
      formId: form.id,
      contactId,
      data,
    }, { orgId: form.orgId });
  }

  return { success: true };
}
