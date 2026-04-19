import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, intakeForms, landingPages } from "@/db/schema";

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
  opts: TemplateOpts & { workspaceName?: string } = {}
): Promise<TemplateOutcome & { title: string }> {
  const [existing] = await db
    .select({ slug: landingPages.slug, title: landingPages.title })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, DEFAULT_LANDING_SLUG)))
    .limit(1);

  if (existing) {
    return { slug: existing.slug, title: existing.title, alreadyExisted: true };
  }

  const title = opts.workspaceName ?? "Welcome";
  const theme = opts.theme ?? "dark";
  const headline = `${title}`;
  const subhead = "Book a call or send us a note — we'll get back to you.";
  const contentHtml = `<main data-theme="${theme}"><section><h1>${escapeHtml(headline)}</h1><p>${escapeHtml(subhead)}</p><p><a href="/book">Book a call</a> · <a href="/intake">Send us a note</a></p></section></main>`;

  await db.insert(landingPages).values({
    orgId,
    title,
    slug: DEFAULT_LANDING_SLUG,
    status: "published",
    pageType: "page",
    source: "template",
    sections: [],
    contentHtml,
    contentCss: null,
    seo: { title, description: subhead },
    settings: { theme },
  });

  return { slug: DEFAULT_LANDING_SLUG, title, alreadyExisted: false };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const DEFAULT_SLUGS = {
  booking: DEFAULT_BOOKING_SLUG,
  intake: DEFAULT_INTAKE_SLUG,
  landing: DEFAULT_LANDING_SLUG,
};
