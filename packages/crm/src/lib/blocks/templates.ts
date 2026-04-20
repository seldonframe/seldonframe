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
    if (existing.source === "template" && !existing.contentCss) {
      await db
        .update(landingPages)
        .set({
          contentHtml: buildSeededHomeHtml(existing.title, opts.theme ?? "dark"),
          contentCss: SEEDED_HOME_CSS,
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, existing.id));
    }
    return { slug: existing.slug, title: existing.title, alreadyExisted: true };
  }

  const title = opts.workspaceName ?? "Welcome";
  const theme = opts.theme ?? "dark";
  const subhead = SEEDED_HOME_SUBHEAD;
  const contentHtml = buildSeededHomeHtml(title, theme);
  const contentCss = SEEDED_HOME_CSS;

  await db.insert(landingPages).values({
    orgId,
    title,
    slug: DEFAULT_LANDING_SLUG,
    status: "published",
    pageType: "page",
    source: "template",
    sections: [],
    contentHtml,
    contentCss,
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

// Shared seed content for createDefaultLandingPage — used on initial insert
// AND by the repair branch that tops up contentCss on pre-fix workspaces
// that stored contentHtml with contentCss=null (which rendered blank).
const SEEDED_HOME_SUBHEAD = "Book a call or send us a note — we'll get back to you.";

function buildSeededHomeHtml(title: string, theme: "dark" | "light") {
  return `<main class="sf-home" data-theme="${theme}">
  <section class="sf-home__hero">
    <h1 class="sf-home__title">${escapeHtml(title)}</h1>
    <p class="sf-home__subhead">${escapeHtml(SEEDED_HOME_SUBHEAD)}</p>
    <div class="sf-home__actions">
      <a class="sf-btn sf-btn--primary" href="/book">Book a call</a>
      <a class="sf-btn sf-btn--secondary" href="/intake">Send us a note</a>
    </div>
  </section>
</main>`;
}

// --sf-* tokens come from the workspace theme via PublicThemeProvider; hard
// fallbacks here match the dark-theme defaults so a theme-provider outage or
// a workspace with missing theme config still renders legibly.
const SEEDED_HOME_CSS = `.sf-home { min-height: 60vh; display: flex; align-items: center; justify-content: center; padding: 4rem 1.5rem; font-family: var(--sf-font, system-ui, -apple-system, "Segoe UI", sans-serif); }
.sf-home__hero { width: 100%; max-width: 640px; text-align: center; }
.sf-home__title { font-size: clamp(2.25rem, 5vw, 3.5rem); line-height: 1.05; letter-spacing: -0.02em; font-weight: 600; margin: 0 0 1rem; color: var(--sf-text, #f5f5f5); }
.sf-home__subhead { font-size: 1.125rem; line-height: 1.5; margin: 0 0 2.5rem; color: color-mix(in srgb, var(--sf-text, #f5f5f5) 70%, transparent); }
.sf-home__actions { display: inline-flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; }
.sf-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 9rem; height: 3rem; padding: 0 1.5rem; border-radius: var(--sf-radius, 0.75rem); font-weight: 500; text-decoration: none; transition: transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease; }
.sf-btn--primary { background: var(--sf-primary, #21a38b); color: #fff; border: 1px solid transparent; }
.sf-btn--primary:hover { transform: translateY(-1px); box-shadow: 0 10px 30px color-mix(in srgb, var(--sf-primary, #21a38b) 40%, transparent); }
.sf-btn--secondary { background: transparent; color: var(--sf-text, #f5f5f5); border: 1px solid var(--sf-border, rgba(255,255,255,0.15)); }
.sf-btn--secondary:hover { background: color-mix(in srgb, var(--sf-text, #f5f5f5) 8%, transparent); }
@media (max-width: 480px) { .sf-btn { min-width: 100%; } }`;

export const DEFAULT_SLUGS = {
  booking: DEFAULT_BOOKING_SLUG,
  intake: DEFAULT_INTAKE_SLUG,
  landing: DEFAULT_LANDING_SLUG,
};
