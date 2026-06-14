"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
import { assertWritable as assertWritableImpl } from "@/lib/demo/server";
import { enforceContactLimit as enforceContactLimitImpl } from "@/lib/billing/limits";
import { emitSeldonEvent } from "@/lib/events/bus";
import { findContactByPhone as findContactByPhoneImpl } from "@/lib/sms/api";
import { sendSmsFromApi } from "@/lib/sms/api";
import { normalizePhone } from "@/lib/sms/suppression";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { sendNewLeadAlert } from "@/lib/notifications/ops-notifications";
import type { LimitDecision } from "@/lib/billing/limits";

// ── Public contract ───────────────────────────────────────────────────────

export type LeadFormInput = {
  orgSlug: string;
  name: string;
  phone: string;
  need: string;
};

export type LeadFormActionResult = {
  ok: boolean;
  smsSent: boolean;
  bookUrl: string;
  /** Set only when ok=false — a friendly message the form surfaces inline. */
  error?: string;
};

// ── Injectable boundary (the repo's testable-deps idiom; see
//    src/lib/events/listeners-testable.ts). The "use server" action below
//    wires the production implementations; unit tests inject fakes so no
//    DB / Twilio / Resend is touched. ───────────────────────────────────────

export type LeadFormDeps = {
  assertWritable: () => void;
  resolveOrgIdBySlug: (slug: string) => Promise<string | null>;
  enforceContactLimit: (orgId: string) => Promise<LimitDecision>;
  findContactByPhone: (orgId: string, phone: string) => Promise<string | null>;
  getContactById: (
    orgId: string,
    contactId: string,
  ) => Promise<{ firstName: string | null; lastName: string | null } | null>;
  createContact: (values: {
    orgId: string;
    firstName: string;
    lastName: string | null;
    phone: string;
    status: "lead";
    source: "landing-leadform";
    customFields: Record<string, unknown>;
  }) => Promise<string>;
  updateContact: (
    contactId: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  emit: (type: "contact.created" | "form.submitted", data: Record<string, unknown>, orgId: string) => Promise<void>;
  buildBookUrl: (slug: string, orgId: string) => string;
  sendSms: (params: {
    orgId: string;
    contactId: string;
    toNumber: string;
    body: string;
  }) => Promise<{ suppressed: boolean }>;
  sendOperatorEmail: (params: {
    businessName: string;
    name: string;
    phone: string;
    need: string;
    orgSlug: string;
  }) => Promise<void>;
  getBusinessName: (orgId: string) => Promise<string>;
  now: () => Date;
};

// ── In-memory idempotency (mirrors the public intake route). Dedup by
//    orgId+phone for a short window so a double-tap doesn't double-create
//    the contact or double-send the SMS. Lives for the lambda's lifetime. ──
const LEAD_IDEMPOTENCY_CACHE = new Map<string, number>();
const LEAD_IDEMPOTENCY_TTL_MS = 60_000;

function leadDedupSeen(key: string, now: number): boolean {
  for (const [k, expires] of LEAD_IDEMPOTENCY_CACHE) {
    if (expires < now) LEAD_IDEMPOTENCY_CACHE.delete(k);
  }
  const existing = LEAD_IDEMPOTENCY_CACHE.get(key);
  if (existing && existing > now) return true;
  LEAD_IDEMPOTENCY_CACHE.set(key, now + LEAD_IDEMPOTENCY_TTL_MS);
  return false;
}

/** Naive "first last" split — matches the public intake route's behavior. */
function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

/**
 * Pure, injectable core. Returns a result object; never throws for the
 * expected branches (limit/suppressed/no-Twilio/validation). Order mirrors
 * app/api/v1/public/intake/route.ts: dedup → resolve → assertWritable →
 * find-or-create → emit → SMS (try/catch) → operator email.
 */
export async function submitLeadFormWithDeps(
  input: LeadFormInput,
  deps: LeadFormDeps,
): Promise<LeadFormActionResult> {
  const name = input.name.trim();
  const phoneRaw = input.phone.trim();
  const need = input.need.trim();
  const orgSlug = input.orgSlug.trim();

  if (!name || !phoneRaw) {
    return { ok: false, smsSent: false, bookUrl: "", error: "Please enter your name and phone." };
  }

  const orgId = await deps.resolveOrgIdBySlug(orgSlug);
  if (!orgId) {
    return { ok: false, smsSent: false, bookUrl: "", error: "Workspace not found." };
  }

  // Demo-readonly guard (no-op in normal workspaces). Throws DEMO_BLOCK_MESSAGE
  // when NEXT_PUBLIC_DEMO_READONLY=true — surfaced to the form as a friendly error.
  try {
    deps.assertWritable();
  } catch (err) {
    return {
      ok: false,
      smsSent: false,
      bookUrl: "",
      error: err instanceof Error ? err.message : "This workspace is read-only.",
    };
  }

  const normalizedPhone = normalizePhone(phoneRaw) || phoneRaw;
  const bookUrl = deps.buildBookUrl(orgSlug, orgId);

  // Idempotency: short-circuit a duplicate submission (same orgId+phone).
  const nowMs = deps.now().getTime();
  if (leadDedupSeen(`${orgId}:${normalizedPhone}`, nowMs)) {
    return { ok: true, smsSent: false, bookUrl };
  }

  // ── Find-or-create contact by phone ──
  const customFields: Record<string, unknown> = need ? { need } : {};
  let contactId = await deps.findContactByPhone(orgId, normalizedPhone);
  let created = false;
  const { firstName, lastName } = splitName(name);

  if (contactId) {
    // Upsert: backfill name ONLY when the existing record's is blank; always
    // merge the latest need into customFields.
    const existing = await deps.getContactById(orgId, contactId);
    const patch: Record<string, unknown> = { customFields, updatedAt: deps.now() };
    if (existing && !(existing.firstName ?? "").trim()) patch.firstName = firstName;
    if (existing && !(existing.lastName ?? "")?.trim()) patch.lastName = lastName;
    await deps.updateContact(contactId, patch);
  } else {
    // Free-tier cap only blocks NEW contacts (mirrors the intake route).
    const limit = await deps.enforceContactLimit(orgId);
    if (!limit.allowed) {
      return { ok: false, smsSent: false, bookUrl, error: limit.message };
    }
    contactId = await deps.createContact({
      orgId,
      firstName,
      lastName,
      phone: normalizedPhone,
      status: "lead",
      source: "landing-leadform",
      customFields,
    });
    created = true;
  }

  // ── Events: contact.created (create only) + form.submitted (always) ──
  if (created) {
    await deps.emit("contact.created", { contactId }, orgId);
  }
  await deps.emit("form.submitted", {
    formId: "landing-leadform",
    contactId,
    data: { name, phone: normalizedPhone, need, source: "landing-leadform" },
  }, orgId);

  // ── Text the lead. try/catch → graceful skip when no Twilio fromNumber
  //    (sendSmsFromApi throws). suppressed=true (no throw) also ⇒ smsSent:false. ──
  let smsSent = false;
  const businessName = await deps.getBusinessName(orgId);
  try {
    const res = await deps.sendSms({
      orgId,
      contactId,
      toNumber: normalizedPhone,
      body: `Hi ${firstName || name}, thanks for reaching out to ${businessName}! Grab a time here: ${bookUrl} — or reply and we'll get you booked.`,
    });
    smsSent = !res.suppressed;
  } catch {
    smsSent = false;
  }

  // ── Email the operator (platform-level; no Twilio/workspace dependency). ──
  await deps.sendOperatorEmail({ businessName, name, phone: normalizedPhone, need, orgSlug });

  return { ok: true, smsSent, bookUrl };
}

// ── Production deps factory ──────────────────────────────────────────────

function makeDefaultDeps(): LeadFormDeps {
  return {
    assertWritable: assertWritableImpl,
    resolveOrgIdBySlug: async (slug) => {
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      return org?.id ?? null;
    },
    enforceContactLimit: enforceContactLimitImpl,
    findContactByPhone: findContactByPhoneImpl,
    getContactById: async (orgId, contactId) => {
      const [row] = await db
        .select({ firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
        .limit(1);
      return row ?? null;
    },
    createContact: async (values) => {
      const [row] = await db.insert(contacts).values(values).returning({ id: contacts.id });
      if (!row) throw new Error("Could not create contact");
      return row.id;
    },
    updateContact: async (contactId, patch) => {
      await db.update(contacts).set(patch).where(eq(contacts.id, contactId));
    },
    emit: (type, data, orgId) =>
      emitSeldonEvent(
        type,
        // The bus is generically typed; both event shapes are satisfied by
        // the records we build in the core.
        data as never,
        { orgId },
      ),
    buildBookUrl: (slug, orgId) =>
      buildWorkspaceUrls(slug, process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com", orgId).book,
    sendSms: async ({ orgId, contactId, toNumber, body }) => {
      const res = await sendSmsFromApi({ orgId, userId: null, contactId, toNumber, body });
      return { suppressed: res.suppressed };
    },
    sendOperatorEmail: (params) => sendNewLeadAlert(params),
    getBusinessName: async (orgId) => {
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      return org?.name ?? "us";
    },
    now: () => new Date(),
  };
}

/**
 * The "use server" action the client form imports directly (mirrors
 * components/bookings/public-booking-form.tsx importing submitPublicBookingAction).
 * Thin wrapper over the injectable core with production deps.
 */
export async function submitLeadFormAction(input: LeadFormInput): Promise<LeadFormActionResult> {
  return submitLeadFormWithDeps(input, makeDefaultDeps());
}
