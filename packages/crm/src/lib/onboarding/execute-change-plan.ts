// ============================================================================
// execute-change-plan.ts — Apply a ChangePlan to a live workspace.
// ============================================================================
//
// Onboarding T13. Runs 6 surfaces in a fixed order; each surface is wrapped
// in its own try/catch so a single failure never aborts the rest. Returns a
// per-surface result map so callers (agency review screen, integration tests)
// can see exactly what succeeded and what didn't.
//
// Dependency-injected for unit-testability without DB/network. Pass custom
// deps in tests; omit (or pass undefined) to use the real implementations.

import type { ChangePlan } from "./change-plan";

// ── result type ───────────────────────────────────────────────────────────────

export type SurfaceResult = {
  ok: boolean;
  error?: string;
};

export type ApplyChangePlanResult = {
  soul: SurfaceResult;
  landing: SurfaceResult;
  booking: SurfaceResult;
  theme: SurfaceResult;
  chatbot: SurfaceResult;
  contacts: SurfaceResult;
};

// ── deps interface ────────────────────────────────────────────────────────────

export interface ApplyChangePlanDeps {
  writeSoul: (orgId: string, soul: Record<string, unknown>) => Promise<void>;
  seedLanding: (orgId: string) => Promise<void>;
  applyBooking: (orgId: string, plan: ChangePlan) => Promise<void>;
  /** Always called — no-ops internally when plan has no theme. */
  applyTheme: (orgId: string, plan: ChangePlan) => Promise<void>;
  refreshChatbot: (orgId: string) => Promise<void>;
  importContacts: (orgId: string, plan: ChangePlan) => Promise<void>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function runSurface(fn: () => Promise<void>): Promise<SurfaceResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

// ── main export ───────────────────────────────────────────────────────────────

export async function applyChangePlan(
  orgId: string,
  plan: ChangePlan,
  deps: ApplyChangePlanDeps = realDeps
): Promise<ApplyChangePlanResult> {
  // Run all 6 surfaces IN ORDER, each isolated. Never abort on failure.
  const soul = await runSurface(() => deps.writeSoul(orgId, plan.soul));
  const landing = await runSurface(() => deps.seedLanding(orgId));
  const booking = await runSurface(() => deps.applyBooking(orgId, plan));
  const theme = await runSurface(() => deps.applyTheme(orgId, plan));
  const chatbot = await runSurface(() => deps.refreshChatbot(orgId));
  const contacts = await runSurface(() => deps.importContacts(orgId, plan));

  return { soul, landing, booking, theme, chatbot, contacts };
}

// ── real deps — wired to DB-layer helpers ─────────────────────────────────────
//
// NOTE: These use direct DB operations (not Next.js server actions) because
// server actions depend on getOrgId() / getCurrentUser() which require an
// active HTTP session. The executor runs in a background job context.

// Lazy imports are used so this file never pulls server-only modules into
// unit-test environments. In production, all these modules are available.

const realDeps: ApplyChangePlanDeps = {
  // ── Step 1: write soul ────────────────────────────────────────────────────
  // Merges plan.soul into organizations.soul (snake_case + camelCase both),
  // then re-seeds the pipeline stages — same contract as /api/v1/soul/submit.
  async writeSoul(orgId, soul) {
    const { db } = await import("@/db");
    const { organizations } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { applyPipelineStagesFromSoul } = await import(
      "@/lib/soul/apply-pipeline-stages"
    );

    // Read existing soul and deep-merge so we don't blow away operator data.
    const [org] = await db
      .select({ soul: organizations.soul })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const existingSoul =
      org?.soul && typeof org.soul === "object"
        ? (org.soul as unknown as Record<string, unknown>)
        : {};

    // 2026-05-18 pattern: write BOTH snake_case AND camelCase keys.
    // business_name → for backward compat; businessName → for settings UI.
    const merged: Record<string, unknown> = { ...existingSoul };
    for (const [k, v] of Object.entries(soul)) {
      merged[k] = v;
      // Promote snake_case keys to camelCase mirrors for the settings UI.
      if (k === "business_name") merged.businessName = v;
      if (k === "soul_description") merged.businessDescription = v;
    }

    await db
      .update(organizations)
      .set({
        soul: merged as unknown as typeof organizations.$inferInsert.soul,
        soulCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    // Best-effort pipeline re-seed (mirrors soul/submit/route.ts).
    try {
      await applyPipelineStagesFromSoul(orgId, merged, null);
    } catch (err) {
      console.warn(
        `[execute-change-plan] pipeline re-seed failed for ${orgId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  },

  // ── Step 2: re-render the landing from the updated soul ───────────────────
  async seedLanding(orgId) {
    const { seedLandingFromSoul } = await import(
      "@/lib/page-schema/seed-landing-from-soul"
    );
    const result = await seedLandingFromSoul(orgId);
    if (!result.ok) {
      throw new Error(`seedLanding skipped: ${result.reason ?? "unknown"}`);
    }
  },

  // ── Step 3: apply booking availability + extra appointment types ──────────
  // Uses listAppointmentTypes(orgId) — supports orgId override — to find the
  // default booking-type row, then updates it. Extra types are created via
  // direct DB inserts mirroring createBookingTypeForSeldonAction.
  async applyBooking(orgId, plan) {
    if (!plan.bookingDefault && plan.appointmentTypes.length === 0) return;

    const { db } = await import("@/db");
    const { bookings } = await import("@/db/schema");
    const { and, asc, eq } = await import("drizzle-orm");

    if (plan.bookingDefault) {
      // Find the workspace's default (first) appointment-type template.
      const [defaultType] = await db
        .select({ id: bookings.id, metadata: bookings.metadata })
        .from(bookings)
        .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template")))
        .orderBy(asc(bookings.createdAt))
        .limit(1);

      if (defaultType) {
        const existing =
          defaultType.metadata && typeof defaultType.metadata === "object"
            ? (defaultType.metadata as Record<string, unknown>)
            : {};
        await db
          .update(bookings)
          .set({
            metadata: {
              ...existing,
              kind: "appointment_type",
              availability: plan.bookingDefault.availability,
            },
            updatedAt: new Date(),
          })
          .where(
            and(eq(bookings.orgId, orgId), eq(bookings.id, defaultType.id))
          );
      }
    }

    // Create extra appointment types from plan.appointmentTypes.
    for (const appt of plan.appointmentTypes) {
      const slug = appt.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
      const now = new Date();
      const endsAt = new Date(now.getTime() + appt.durationMinutes * 60_000);
      await db.insert(bookings).values({
        orgId,
        userId: null as unknown as string, // server-side create, no session user
        title: appt.title,
        bookingSlug: slug || "appointment",
        fullName: null,
        email: null,
        notes: null,
        provider: "manual",
        status: "template",
        startsAt: now,
        endsAt,
        metadata: {
          kind: "appointment_type",
          durationMinutes: appt.durationMinutes,
          description: "",
          price: appt.price,
        },
      });
    }
  },

  // ── Step 4: apply brand theme ─────────────────────────────────────────────
  // Direct DB write — mirrors the retired settings-form action (theme writes
  // now flow through saveThemeForOrg) but without session
  // auth or revalidatePath (those are HTTP-only concerns).
  // No-op when plan has no theme (avoids resetting to defaults).
  async applyTheme(orgId, plan) {
    if (!plan.theme) return;
    const { db } = await import("@/db");
    const { organizations } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { normalizeTheme } = await import("@/lib/theme/normalize-theme");

    const nextTheme = normalizeTheme(plan.theme);
    await db
      .update(organizations)
      .set({ theme: nextTheme, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
  },

  // ── Step 5: refresh chatbot persona from soul ─────────────────────────────
  // There is no clean server-callable function that refreshes only the
  // chatbot prompt from the soul without creating a new agent or going
  // through the HTTP layer. The chatbot's prompt is rebuilt at runtime from
  // org.soul each time a conversation starts (see lib/agents/prompt.ts).
  // No persistent per-agent copy needs to be flushed here.
  //
  // LOGGED NO-OP: flagged in report per plan instructions.
  async refreshChatbot(_orgId) {
    console.info(
      "[execute-change-plan] refreshChatbot: no-op — chatbot prompt is " +
        "derived from org.soul at runtime; no flush required."
    );
  },

  // ── Step 6: import contacts from CSV URL ──────────────────────────────────
  // Uses papaparse to parse the CSV, maps columns to ImportedContactRow, then
  // inserts via a minimal direct DB insert (mirrors bulkImportContactsAction
  // but passes orgId directly instead of pulling from session).
  async importContacts(orgId, plan) {
    if (!plan.contactsFileUrl) return;

    const Papa = await import("papaparse");
    const { db } = await import("@/db");
    const { contacts } = await import("@/db/schema");

    const response = await fetch(plan.contactsFileUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch contacts file: ${response.status} ${response.statusText}`
      );
    }
    const csv = await response.text();

    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      console.warn(
        "[execute-change-plan] CSV parse warnings:",
        parsed.errors.slice(0, 3)
      );
    }

    const rows = parsed.data;
    if (rows.length === 0) return;

    // Map loose CSV headers (case-insensitive) to ImportedContactRow shape.
    const toInsert = rows.map((row) => {
      const get = (keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(row).find(
            (rk) => rk.trim().toLowerCase() === k.toLowerCase()
          );
          if (found) return String(row[found] ?? "").trim();
        }
        return "";
      };
      const firstName = get(["firstName", "first_name", "first"]);
      const lastName = get(["lastName", "last_name", "last"]);
      const email = get(["email"]);
      const phone = get(["phone", "phoneNumber", "phone_number"]);
      const company = get(["company", "organization"]);
      const notes = get(["notes", "note"]);
      return {
        orgId,
        firstName: firstName || (email ? email.split("@")[0] : "Contact"),
        lastName,
        email,
        phone,
        company,
        status: "lead",
        source: "csv_import",
        customFields: notes ? { notes } : {},
      };
    });

    // Batch insert in chunks of 50 (same as bulkImportContactsAction).
    for (let i = 0; i < toInsert.length; i += 50) {
      await db.insert(contacts).values(toInsert.slice(i, i + 50));
    }
  },
};
