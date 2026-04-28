import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, intakeForms, landingPages } from "@/db/schema";
import {
  buildBlueprintForWorkspace,
  renderBlueprint,
} from "@/lib/blueprint/persist";

export type TemplateOpts = {
  theme?: "dark" | "light";
};

const DEFAULT_BOOKING_SLUG = "default";
const DEFAULT_INTAKE_SLUG = "intake";
const DEFAULT_LANDING_SLUG = "home";

export type TemplateOutcome = {
  slug: string;
  alreadyExisted: boolean;
};

// Idempotent — if a row with this slug already exists for this workspace,
// return it unchanged so re-installs don't clone templates.
export async function createDefaultBookingTemplate(
  orgId: string,
  opts: TemplateOpts = {}
): Promise<TemplateOutcome & { title: string }> {
  const [existing] = await db
    .select({ bookingSlug: bookings.bookingSlug, title: bookings.title })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.bookingSlug, DEFAULT_BOOKING_SLUG)))
    .limit(1);

  if (existing) {
    return {
      slug: existing.bookingSlug,
      title: existing.title,
      alreadyExisted: true,
    };
  }

  const now = new Date();
  const title = "Book a call";
  const metadata = {
    appointmentName: title,
    appointmentDescription: "Pick a time that works for you. We'll confirm by email.",
    durationMinutes: 30,
    confirmationMessage: "Thanks! Check your email for the confirmation.",
    theme: opts.theme ?? "dark",
    availability: {
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      startHour: 9,
      endHour: 17,
    },
  };

  await db.insert(bookings).values({
    orgId,
    title,
    bookingSlug: DEFAULT_BOOKING_SLUG,
    provider: "manual",
    status: "template",
    startsAt: now,
    endsAt: now,
    metadata,
  });

  return { slug: DEFAULT_BOOKING_SLUG, title, alreadyExisted: false };
}

export async function createDefaultIntakeForm(
  orgId: string,
  opts: TemplateOpts = {}
): Promise<TemplateOutcome & { name: string }> {
  const [existing] = await db
    .select({ slug: intakeForms.slug, name: intakeForms.name })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.slug, DEFAULT_INTAKE_SLUG)))
    .limit(1);

  if (existing) {
    return { slug: existing.slug, name: existing.name, alreadyExisted: true };
  }

  const name = "Get in touch";
  const fields = [
    { key: "fullName", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone (optional)", type: "tel", required: false },
    {
      key: "message",
      label: "What can we help with?",
      type: "textarea",
      required: true,
    },
  ];

  await db.insert(intakeForms).values({
    orgId,
    name,
    slug: DEFAULT_INTAKE_SLUG,
    fields,
    settings: { theme: opts.theme ?? "dark", submitLabel: "Send" },
    isActive: true,
  });

  return { slug: DEFAULT_INTAKE_SLUG, name, alreadyExisted: false };
}

export async function createDefaultLandingPage(
  orgId: string,
  opts: TemplateOpts & { workspaceName?: string; industry?: string | null } = {}
): Promise<TemplateOutcome & { title: string }> {
  const [existing] = await db
    .select({
      id: landingPages.id,
      slug: landingPages.slug,
      title: landingPages.title,
      contentHtml: landingPages.contentHtml,
      contentCss: landingPages.contentCss,
      source: landingPages.source,
    })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, DEFAULT_LANDING_SLUG)))
    .limit(1);

  if (existing) {
    // Repair branch: pre-fix seeds stored contentHtml with contentCss: null,
    // which falls through to the empty-sections renderer and shows a blank
    // page. If we find such a row AND it's still the original template
    // (source='template', not user-customized via /api/v1/landing/update or
    // Puck), top up the missing contentCss. User-customized rows are left
    // alone regardless.
    //
    // C3.3: also backfills `blueprintJson` on the same repair so the
    // customization loop (load → mutate → render → save) has a source to
    // round-trip through. Existing pre-C3.3 rows with contentHtml but no
    // blueprintJson get one written here on next access.
    if (existing.source === "template" && !existing.contentCss) {
      const repaired = buildAndRender(existing.title, opts.industry ?? null);
      await db
        .update(landingPages)
        .set({
          contentHtml: repaired.contentHtml,
          contentCss: repaired.contentCss,
          blueprintJson: repaired.blueprint as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, existing.id));
    }
    return { slug: existing.slug, title: existing.title, alreadyExisted: true };
  }

  const title = opts.workspaceName ?? "Welcome";
  const subhead = SEEDED_HOME_SUBHEAD;
  const rendered = buildAndRender(title, opts.industry ?? null);

  await db.insert(landingPages).values({
    orgId,
    title,
    slug: DEFAULT_LANDING_SLUG,
    status: "published",
    pageType: "page",
    source: "template",
    sections: [],
    contentHtml: rendered.contentHtml,
    contentCss: rendered.contentCss,
    // C3.3: source-of-truth Blueprint JSON. Read by update_landing_*
    // tools when they need to mutate + re-render without losing C3.x
    // visual polish.
    blueprintJson: rendered.blueprint as unknown as Record<string, unknown>,
    seo: { title, description: subhead },
    // C3.3: stash `industry` in settings so the customization-loop
    // fallback path can re-derive a starter blueprint for legacy rows
    // (rows whose blueprint_json is NULL because they predate C3.3).
    settings: {
      theme: "light",
      blueprintRenderer: "general-service-v1",
      industry: opts.industry ?? null,
    },
  });

  return { slug: DEFAULT_LANDING_SLUG, title, alreadyExisted: false };
}

/**
 * Phase 3 C3.3: pick a starter blueprint by industry, customize the
 * workspace.name slot, run it through the renderer. Returns the
 * blueprint plus its rendered html/css — all three need to be persisted
 * together so the customization loop can round-trip.
 *
 * Light mode only in v1. Industry null/unknown → general fallback.
 */
function buildAndRender(workspaceName: string, industry: string | null) {
  const blueprint = buildBlueprintForWorkspace(workspaceName, industry);
  return renderBlueprint(blueprint);
}

// Subhead used for the landing page's seo.description metadata. The actual
// page body comes from the blueprint renderer (general-service-v1) which
// sources its own copy from the resolved blueprint's hero/about sections.
const SEEDED_HOME_SUBHEAD = "Book a call or send us a note — we'll get back to you.";

export const DEFAULT_SLUGS = {
  booking: DEFAULT_BOOKING_SLUG,
  intake: DEFAULT_INTAKE_SLUG,
  landing: DEFAULT_LANDING_SLUG,
};
