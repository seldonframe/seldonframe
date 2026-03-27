"use server";

import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { inferClientLifecycleFromStatus } from "@/lib/soul/learning";

export async function listContacts(search?: string) {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  if (search) {
    return db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), ilike(contacts.firstName, `%${search}%`)));
  }

  return db.select().from(contacts).where(eq(contacts.orgId, orgId));
}

export async function createContactAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const status = String(formData.get("status") ?? "lead");
  const source = String(formData.get("source") ?? "manual");

  const [createdContact] = await db
    .insert(contacts)
    .values({
      orgId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      status,
      source,
    })
    .returning({ id: contacts.id });

  if (createdContact?.id) {
    await emitSeldonEvent("contact.created", { contactId: createdContact.id });
  }

  await inferClientLifecycleFromStatus({
    orgId,
    status,
    source,
  });
}
