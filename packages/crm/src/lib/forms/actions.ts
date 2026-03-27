"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, intakeForms, intakeSubmissions, users } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getSoul } from "@/lib/soul/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { dispatchWebhook } from "@/lib/utils/webhooks";
import { assertWritable } from "@/lib/demo/server";

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

  const [org] = await db.select().from(users).limit(1);
  void org;

  const [form] = await db
    .select({ id: intakeForms.id, orgId: intakeForms.orgId })
    .from(intakeForms)
    .where(eq(intakeForms.slug, formSlug))
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
        await emitSeldonEvent("contact.created", { contactId: created.id });
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
    });
  }

  return { success: true };
}
