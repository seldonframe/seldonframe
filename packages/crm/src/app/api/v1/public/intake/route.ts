import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, intakeForms, intakeSubmissions, organizations } from "@/db/schema";
import type { IntakeFormField } from "@/db/schema/intake-forms";
import { enforceContactLimit } from "@/lib/billing/limits";
import { emitSeldonEvent } from "@/lib/events/bus";
import {
  resolveWorkspaceSlugFromRequest,
  resolveWorkspaceSlugFromRequestWithCustomDomains,
} from "@/lib/workspace/host-to-slug";

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
  // 2026-05-18 (later) — client-supplied dedup key. The form client
  // generates a fresh idempotencyKey on its FIRST submit() call and
  // resends it with the same value if a network retry happens.
  // Server uses it to short-circuit duplicate submissions inside a
  // 60s window so the agent dispatcher doesn't start two parallel
  // speed-to-lead runs for the same form submission. Header
  // `Idempotency-Key` is also accepted (and preferred — survives JSON
  // body parse failures).
  idempotencyKey?: unknown;
};

// 2026-05-18 (later) — in-memory dedup cache. Lives for the lifetime
// of the lambda instance (~minutes). Maps idempotencyKey → expiresAt.
// Cheap enough at the volume we operate at; a DB-backed cache is the
// follow-up if we ever see cross-instance double-submits.
const IDEMPOTENCY_CACHE = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 60_000;

function dedupSeen(key: string): boolean {
  const now = Date.now();
  // Sweep expired entries opportunistically.
  for (const [k, expires] of IDEMPOTENCY_CACHE) {
    if (expires < now) IDEMPOTENCY_CACHE.delete(k);
  }
  const existing = IDEMPOTENCY_CACHE.get(key);
  if (existing && existing > now) return true;
  IDEMPOTENCY_CACHE.set(key, now + IDEMPOTENCY_TTL_MS);
  return false;
}

export async function POST(request: Request) {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // 2026-05-18 (later) — idempotency check. Header takes precedence
  // over body field (header survives partial JSON parse failures).
  // When the same key arrives twice within IDEMPOTENCY_TTL_MS, return
  // a 200 OK with `deduplicated: true` so the form client still shows
  // the completion UI but the backend doesn't double-emit form.submitted.
  //
  // Why both header AND body field: edge proxies sometimes strip
  // custom headers; the body field is the bulletproof fallback. The
  // form client sends both — we accept either.
  const idempotencyKey =
    request.headers.get("idempotency-key") ||
    (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "");
  if (idempotencyKey && dedupSeen(idempotencyKey)) {
    console.log(
      JSON.stringify({
        event: "public_intake_deduplicated",
        idempotency_key: idempotencyKey,
      }),
    );
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  // v1.3.5 — orgSlug resolution: body-FIRST, host-FALLBACK on the
  // <slug>.app.seldonframe.com case.
  // v1.16.2 — custom-domain override. On a custom domain the C5
  // client falls back to hostname.split('.')[0] which yields the
  // wrong segment (e.g. "hvac" instead of "cypress-pine-hvac"). When
  // the host is a verified custom domain in workspace_domains, we
  // resolve the canonical slug and PREFER it over body's value.
  const bodyOrgSlug = typeof body.orgSlug === "string" ? body.orgSlug.trim() : "";
  const customDomainSlug = await resolveWorkspaceSlugFromRequestWithCustomDomains(request);
  const subdomainSlug = customDomainSlug ? null : resolveWorkspaceSlugFromRequest(request);
  const orgSlug = customDomainSlug || bodyOrgSlug || subdomainSlug || "";
  const formSlug =
    typeof body.formSlug === "string" && body.formSlug.trim().length > 0
      ? body.formSlug.trim()
      : "intake";
  const answers =
    body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>)
      : null;

  if (!orgSlug || !answers) {
    // Structured logging mirrors the booking route so we can tell
    // body-vs-host derivation failure apart from genuine bad requests.
    console.error(
      JSON.stringify({
        event: "public_intake_rejected",
        reason: "missing_required_field",
        orgSlug_present: Boolean(orgSlug),
        answers_present: Boolean(answers),
        host_header: request.headers.get("host"),
        x_forwarded_host: request.headers.get("x-forwarded-host"),
        form_slug: formSlug,
      }),
    );
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

  // 2026-05-19 — server-side dedup against intake_submissions. The
  // in-memory idempotency cache (above) only catches re-tries that
  // happen to hit the same lambda instance; two parallel POSTs to
  // different cold-start instances both pass it. This second guard
  // queries the durable intake_submissions table for an identical
  // payload from the last 30s. If found, return deduplicated without
  // re-emitting form.submitted (which would spawn a second agent run).
  //
  // Why intake_submissions instead of a dedicated dedup table: we
  // already write to it on every submit, so the cost is one extra
  // SELECT — no schema migration needed. Content match uses
  // jsonb_strip_nulls equality which ignores key ordering.
  try {
    const dupeRows = await db.execute(sql`
      SELECT id FROM intake_submissions
      WHERE org_id = ${org.id}
        AND form_id = ${form.id}
        AND jsonb_strip_nulls(data) = jsonb_strip_nulls(${JSON.stringify(answers)}::jsonb)
        AND created_at > NOW() - INTERVAL '30 seconds'
      LIMIT 1
    `);
    const rows = (dupeRows as unknown as { rows?: Array<{ id: string }> }).rows ?? (dupeRows as unknown as Array<{ id: string }>);
    if (Array.isArray(rows) && rows.length > 0) {
      console.log(
        JSON.stringify({
          event: "public_intake_deduplicated_by_content",
          org_id: org.id,
          form_id: form.id,
          existing_submission_id: rows[0].id,
        }),
      );
      return NextResponse.json({ ok: true, deduplicated: true });
    }
  } catch (err) {
    // Defensive: if the content-dedup SQL fails for any reason,
    // fall through to the normal insert path. Worst case is the
    // legacy double-submit behavior — better than blocking ALL
    // submissions on a broken dedup query.
    console.warn(
      JSON.stringify({
        event: "public_intake_dedup_query_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // Pull contact-shaped fields out of the answers blob using the form's
  // field schema. Type-based first (the cleanest signal — `email` /
  // `phone` types map straight through), id-based fallback for the
  // common conventional ids (fullName/name/firstName).
  const formFields = (Array.isArray(form.fields) ? form.fields : []) as IntakeFormField[];
  const extracted = extractContactFromAnswers(answers, formFields);

  let contactId: string | null = null;
  let contactCreated = false;
  let contactLimitBlocked = false;
  if (extracted.email) {
    const [existingContact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, org.id), eq(contacts.email, extracted.email)))
      .limit(1);
    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // April 30, 2026 — free-tier contact cap enforcement. Submissions
      // are still saved to `intake_submissions` so the operator
      // doesn't lose the lead, but we DON'T create a new `contacts`
      // row past the cap. The /contacts page surfaces a banner so the
      // operator knows new contacts are queued behind the upgrade.
      const limit = await enforceContactLimit(org.id);
      if (!limit.allowed) {
        contactLimitBlocked = true;
        console.info("[intake-route] contact limit reached", {
          orgId: org.id,
          tier: limit.tier,
          used: limit.used,
          limit: limit.limit,
        });
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

  // Also emit `form.submitted` — the canonical agent-archetype trigger
  // name (Speed-to-Lead and any future intake-listening archetype use
  // it). Kept separate from `intake.submitted` for backward compat:
  // existing subscribers (Brain, telemetry) keep using their event;
  // the agent dispatcher hooks `form.submitted` exclusively. Payload
  // includes `orgId` so the dispatcher's listener can route to the
  // right workspace without re-resolving from the form id.
  void emitSeldonEvent(
    "form.submitted",
    {
      formId: form.id,
      contactId: contactId ?? "",
      data: answers,
    },
    { orgId: org.id }
  ).catch(() => undefined);

  // v1.6.0 — brain trigger: append a dated observation to the
  // workspace's intake/recent-leads.md note. Captures the SHAPE of
  // what's being asked (which questions are answered, which are
  // skipped, which categories visitors pick) without storing PII. Over
  // time this becomes a "what kinds of leads come through this form"
  // record the IDE agent reads when generating future intake / hero /
  // FAQ blocks. Best-effort — never blocks the submission response.
  void (async () => {
    try {
      const { appendToBrainNote } = await import("@/lib/brain/store");
      // Summarize the answer keys (not values — protects PII). A note
      // like "5 fields filled, 1 skipped — service: AC repair" tells the
      // agent which question categories drive completion vs. drop-off.
      const answerKeys = Object.keys(answers).filter((k) => {
        const v = answers[k];
        return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
      });
      const skippedKeys = formFields
        .map((f) => f.key)
        .filter((k) => !answerKeys.includes(k));
      // Pull a few low-risk values that suggest "what kind of lead":
      // service / interest / how-did-you-hear style fields. Skip anything
      // that looks like email/phone/address/name.
      const PII_KEY_RE = /email|phone|address|name|street|zip|postal/i;
      const safeValues = answerKeys
        .filter((k) => !PII_KEY_RE.test(k))
        .slice(0, 4)
        .map((k) => {
          const v = answers[k];
          const str = typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : String(v);
          return `${k}: ${str.slice(0, 60)}`;
        })
        .join(" | ");
      await appendToBrainNote({
        orgId: org.id,
        scope: "workspace",
        path: "intake/recent-leads.md",
        paragraph: `Submission via /${formSlug}: ${answerKeys.length} answered, ${skippedKeys.length} skipped. ${safeValues || "(no non-PII fields to summarize)"}`,
        metadata: {
          type: "fact",
          tags: ["intake", "lead-shape"],
          source: `trigger:form.submitted:${form.id}`,
          related_block_types: ["intake", "hero", "faq"],
        },
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "brain_trigger_intake_failed",
          form_slug: formSlug,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  })();

  // v1.3.5 — funnel observability. Pairs with public_intake_rejected so
  // every public submission has a single-line outcome record.
  console.log(
    JSON.stringify({
      event: "public_intake_succeeded",
      org_slug: orgSlug,
      form_slug: formSlug,
      contact_created: contactCreated,
      contact_limit_blocked: contactLimitBlocked,
      slug_source: bodyOrgSlug ? "body" : "host",
    }),
  );

  // The form-submitter sees a flat success — they shouldn't know about
  // the operator's contact cap. The operator surface gets the signal
  // via the intake_submissions row + a banner on /contacts.
  return NextResponse.json({ ok: true, contactLimitBlocked });
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
