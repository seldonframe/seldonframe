"use server";

import { and, asc, desc, eq, gte, ilike, not, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, pipelines } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { inferClientLifecycleFromStatus } from "@/lib/soul/learning";
import { DEMO_CONTACT_TAG } from "@/lib/workspace/seed-demo-portal";

type ContactListSort = "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc";

type ContactListOptions = {
  search?: string;
  status?: string;
  sort?: ContactListSort;
  createdAfter?: Date;
  /** v1.24.0 — explicit orgId override. When set, skip the session-
   *  based getOrgId() resolution. Used by the operator portal mirror
   *  which has a different session source than NextAuth. */
  orgId?: string;
  /** v1.55.x — include the demo contact (tag '__demo__') seeded by
   *  v2/complete for one-click portal previews. Defaults to false so
   *  the operator-facing CRM grid stays clean. A single-contact-by-id
   *  lookup elsewhere still returns the demo contact (so the operator
   *  can inspect it from a deep link if curious). */
  includeDemo?: boolean;
};

type ImportedContactRow = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  notes?: string;
};

export async function listContacts(options?: ContactListOptions) {
  // v1.24.0 — accept an explicit orgId override so the operator-portal
  // mirror (which authenticates via the sf_operator_session cookie,
  // not NextAuth) can reuse this helper.
  const orgId = options?.orgId ?? (await getOrgId());

  if (!orgId) {
    return [];
  }

  const search = options?.search?.trim();
  const status = options?.status?.trim();
  const sort = options?.sort ?? "recent";
  const createdAfter = options?.createdAfter;
  const includeDemo = options?.includeDemo ?? false;

  const conditions = [eq(contacts.orgId, orgId)];

  // v1.55.x — filter the seeded demo contact ('__demo__' tag) from the
  // operator-facing CRM grid by default. Tag exists so the /customer/
  // <slug>/demo route can find the contact (one-click portal preview)
  // without polluting operator views. Caller can set includeDemo=true
  // to override (e.g., admin diagnostics).
  if (!includeDemo) {
    conditions.push(not(sql`${DEMO_CONTACT_TAG} = ANY(${contacts.tags})`));
  }

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

  if (createdAfter) {
    conditions.push(gte(contacts.createdAt, createdAfter));
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
  const notes = String(formData.get("notes") ?? "").trim();

  const [createdContact] = await db
    .insert(contacts)
    .values({
      orgId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      status,
      source,
      customFields: notes ? { notes } : {},
    })
    .returning({ id: contacts.id });

  if (createdContact?.id) {
    await emitSeldonEvent("contact.created", { contactId: createdContact.id }, { orgId: orgId });
  }

  await inferClientLifecycleFromStatus({
    orgId,
    status,
    source,
  });

  return { id: createdContact?.id ?? null };
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveStatus(rawStatus: string, stageNames: string[], defaultStatus: string) {
  const normalizedRaw = normalizeText(rawStatus);
  if (!normalizedRaw) {
    return { status: defaultStatus, matched: false };
  }

  const exact = stageNames.find((stage) => normalizeText(stage) === normalizedRaw);
  if (exact) {
    return { status: exact, matched: true };
  }

  const loose = stageNames.find((stage) => {
    const normalizedStage = normalizeText(stage);
    return normalizedStage.includes(normalizedRaw) || normalizedRaw.includes(normalizedStage);
  });

  if (loose) {
    return { status: loose, matched: true };
  }

  return { status: defaultStatus, matched: false };
}

export async function bulkImportContactsAction(input: { rows: ImportedContactRow[] }) {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length === 0) {
    return {
      createdCount: 0,
      stageSummary: [] as Array<{ stage: string; count: number }>,
      fallbackCount: 0,
    };
  }

  const [defaultPipeline] = await db
    .select({ stages: pipelines.stages })
    .from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
    .limit(1);

  const stageNames = Array.isArray(defaultPipeline?.stages)
    ? defaultPipeline.stages.map((stage) => stage.name).filter((stage): stage is string => Boolean(stage?.trim()))
    : [];
  const defaultStatus = stageNames[0] || "lead";

  const toInsert: Array<{
    orgId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    company: string;
    status: string;
    source: string;
    customFields: Record<string, unknown>;
  }> = [];

  let fallbackCount = 0;

  for (const row of rows) {
    const firstName = String(row.firstName ?? "").trim();
    const lastName = String(row.lastName ?? "").trim();
    const email = String(row.email ?? "").trim();
    const phone = String(row.phone ?? "").trim();
    const company = String(row.company ?? "").trim();
    const notes = String(row.notes ?? "").trim();
    const statusResult = resolveStatus(String(row.status ?? ""), stageNames, defaultStatus);

    if (!statusResult.matched) {
      fallbackCount += 1;
    }

    const derivedFirstName = firstName || (email ? email.split("@")[0] : "Contact");

    toInsert.push({
      orgId,
      firstName: derivedFirstName,
      lastName,
      email,
      phone,
      company,
      status: statusResult.status,
      source: "csv_import",
      customFields: notes ? { notes } : {},
    });
  }

  const insertedStatuses = new Map<string, number>();
  const createdIds: string[] = [];

  for (let index = 0; index < toInsert.length; index += 50) {
    const batch = toInsert.slice(index, index + 50);
    const inserted = await db
      .insert(contacts)
      .values(batch)
      .returning({ id: contacts.id, status: contacts.status });

    for (const row of inserted) {
      createdIds.push(row.id);
      insertedStatuses.set(row.status, (insertedStatuses.get(row.status) ?? 0) + 1);
    }
  }

  for (const contactId of createdIds) {
    await emitSeldonEvent("contact.created", { contactId }, { orgId: orgId });
  }

  for (const [status, count] of insertedStatuses) {
    if (count > 0) {
      await inferClientLifecycleFromStatus({ orgId, status, source: "csv_import" });
    }
  }

  return {
    createdCount: createdIds.length,
    stageSummary: Array.from(insertedStatuses.entries()).map(([stage, count]) => ({ stage, count })),
    fallbackCount,
  };
}

const editableContactFields = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "status",
]);

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
    phone: string | null;
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
  } else if (field === "phone") {
    updates.phone = normalizedValue || null;
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
