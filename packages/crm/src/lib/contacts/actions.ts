"use server";

import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { inferClientLifecycleFromStatus } from "@/lib/soul/learning";

type ContactListSort = "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc";

type ContactListOptions = {
  search?: string;
  status?: string;
  sort?: ContactListSort;
};

export async function listContacts(options?: ContactListOptions) {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  const search = options?.search?.trim();
  const status = options?.status?.trim();
  const sort = options?.sort ?? "recent";

  const conditions = [eq(contacts.orgId, orgId)];

  if (search) {
    const searchCondition = or(
      ilike(contacts.firstName, `%${search}%`),
      ilike(contacts.lastName, `%${search}%`),
      ilike(contacts.email, `%${search}%`),
      ilike(contacts.company, `%${search}%`)
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (status && status !== "all") {
    conditions.push(eq(contacts.status, status));
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const base = db.select().from(contacts).where(whereClause);

  switch (sort) {
    case "name_asc":
      return base.orderBy(asc(contacts.firstName), asc(contacts.lastName), desc(contacts.createdAt));
    case "name_desc":
      return base.orderBy(desc(contacts.firstName), desc(contacts.lastName), desc(contacts.createdAt));
    case "score_desc":
      return base.orderBy(desc(contacts.score), desc(contacts.createdAt));
    case "score_asc":
      return base.orderBy(asc(contacts.score), desc(contacts.createdAt));
    default:
      return base.orderBy(desc(contacts.createdAt));
  }
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

const editableContactFields = new Set(["firstName", "lastName", "email", "status"]);

export async function updateContactFieldAction({
  contactId,
  field,
  value,
}: {
  contactId: string;
  field: string;
  value: string;
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  if (!editableContactFields.has(field)) {
    throw new Error("Field is not editable");
  }

  const normalizedValue = value.trim();

  if (field === "firstName" && normalizedValue.length === 0) {
    throw new Error("First name is required");
  }

  if (field === "email" && normalizedValue.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue)) {
    throw new Error("Invalid email");
  }

  const updates: Partial<{
    firstName: string;
    lastName: string | null;
    email: string | null;
    status: string;
    updatedAt: Date;
  }> = {
    updatedAt: new Date(),
  };

  if (field === "firstName") {
    updates.firstName = normalizedValue;
  } else if (field === "lastName") {
    updates.lastName = normalizedValue || null;
  } else if (field === "email") {
    updates.email = normalizedValue || null;
  } else if (field === "status") {
    updates.status = normalizedValue || "lead";
  }

  await db
    .update(contacts)
    .set(updates)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));

  if (field === "status") {
    await inferClientLifecycleFromStatus({
      orgId,
      status: updates.status ?? "lead",
      source: "inline_edit",
    });
  }

  return { success: true };
}
