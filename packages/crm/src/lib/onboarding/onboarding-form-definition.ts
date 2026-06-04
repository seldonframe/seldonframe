/**
 * Onboarding intake form — question set + seeder.
 *
 * Shown to clients after they pay. The renderer displays ONE question
 * per card (formbricks-stack-v1 flow). Seeder creates the intake_forms
 * row with slug="onboarding" using the same DB pattern as
 * createDefaultIntakeForm in lib/blocks/templates.ts.
 *
 * Intro/outro: the Intake blueprint shape does not have a dedicated
 * welcome/closing panel at the question level — those are expressed via
 * Intake.title, Intake.description, and Intake.completion, not as
 * IntakeQuestion entries. We therefore set friendly copy on those fields
 * inside seedOnboardingForm rather than adding fake questions.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { intakeForms } from "@/db/schema";
import type { IntakeQuestion } from "@/lib/blueprint/types";

// ─── Question set ────────────────────────────────────────────────────────────

export const ONBOARDING_QUESTIONS: IntakeQuestion[] = [
  // ── Business ──────────────────────────────────────────────────────────────
  {
    id: "business_name",
    type: "text",
    label: "What's your business called?",
    required: true,
  },
  {
    id: "tagline",
    type: "text",
    label: "Describe what you do in one line",
    required: true,
  },
  {
    id: "phone",
    type: "phone",
    label: "Business phone number",
    required: true,
  },
  {
    id: "email",
    type: "email",
    label: "Business email address",
    required: true,
  },
  {
    id: "has_public_address",
    type: "select",
    label: "Do clients visit you at an address?",
    required: true,
    options: ["Yes", "No"],
  },
  {
    id: "address",
    type: "text",
    label: "Your address",
    required: false,
    showIf: {
      questionId: "has_public_address",
      operator: "equals",
      value: "Yes",
    },
  },
  {
    id: "hours_text",
    type: "textarea",
    label: "What are your hours? e.g. Mon–Fri 9–5, Sat 10–2, closed Sun",
    required: true,
  },

  // ── Services ───────────────────────────────────────────────────────────────
  {
    id: "services_text",
    type: "textarea",
    label: "List your services and prices, one per line — e.g. 60-min massage — $90",
    required: true,
  },
  {
    id: "primary_service",
    type: "text",
    label: "Which service is your main 'Book now' button?",
    required: true,
  },

  // ── Brand ──────────────────────────────────────────────────────────────────
  {
    id: "logo",
    type: "file",
    label: "Upload your logo",
    required: false,
    file: {
      accept: [".png", ".jpg", ".jpeg", ".webp", ".svg"],
      maxSizeMb: 5,
      multiple: false,
    },
  },
  {
    id: "brand_colors",
    type: "text",
    label: "Brand colors? (or leave blank to use your logo's)",
    required: false,
  },
  {
    id: "photos",
    type: "file",
    label: "Upload a few photos of your space/team/work",
    required: false,
    file: {
      accept: [".png", ".jpg", ".jpeg", ".webp"],
      maxSizeMb: 10,
      multiple: true,
    },
  },
  {
    id: "website_url",
    type: "text",
    label: "Your current website URL (if any)",
    required: false,
  },
  {
    id: "socials",
    type: "textarea",
    label: "Social links (Instagram, Facebook…)",
    required: false,
  },

  // ── Reviews ────────────────────────────────────────────────────────────────
  {
    id: "google_reviews_url",
    type: "text",
    label: "Your Google Business / reviews link",
    required: false,
  },
  {
    id: "testimonials",
    type: "textarea",
    label: "A few things clients always say about you (or leave blank — we'll pull from Google)",
    required: false,
  },

  // ── Data ───────────────────────────────────────────────────────────────────
  {
    id: "contacts_file",
    type: "file",
    label: "Upload your contacts (CSV/Excel from your old CRM)",
    required: false,
    file: {
      accept: [".csv", ".xlsx", ".xls"],
      maxSizeMb: 10,
      multiple: false,
    },
  },
  {
    id: "bookings_file",
    type: "file",
    label: "Upload your upcoming appointments (CSV)",
    required: false,
    file: {
      accept: [".csv"],
      maxSizeMb: 10,
      multiple: false,
    },
  },

  // ── Phones ─────────────────────────────────────────────────────────────────
  {
    id: "call_handling",
    type: "select",
    label: "How should we handle your phone?",
    required: true,
    options: ["AI answers my calls", "I answer — text me missed callers", "Not yet"],
  },
  {
    id: "lead_routing",
    type: "multi-select",
    label: "Where should new leads reach you?",
    required: true,
    options: ["Email", "Text"],
  },

  // ── Domain ─────────────────────────────────────────────────────────────────
  {
    id: "has_domain",
    type: "select",
    label: "Do you have a website domain?",
    required: true,
    options: ["Yes", "No"],
  },
  {
    id: "domain",
    type: "text",
    label: "Enter your domain, e.g. yourpractice.com",
    required: false,
    showIf: {
      questionId: "has_domain",
      operator: "equals",
      value: "Yes",
    },
  },
];

// ─── Seeder ───────────────────────────────────────────────────────────────────

const ONBOARDING_SLUG = "onboarding";
const ONBOARDING_FORM_NAME = "Client Onboarding";

/**
 * Creates an intake_forms row for this org with slug="onboarding".
 * Idempotent: returns the existing form's id if it already exists.
 *
 * Mirrors the createDefaultIntakeForm pattern in lib/blocks/templates.ts:
 * maps IntakeQuestion → IntakeFormField (key/label/type/required/options)
 * and inserts into intake_forms. No blueprint rendering is performed here
 * because the /onboard/[token] route serves its own card-flow renderer.
 */
export async function seedOnboardingForm(
  orgId: string,
): Promise<{ formId: string }> {
  const [existing] = await db
    .select({ id: intakeForms.id })
    .from(intakeForms)
    .where(
      and(
        eq(intakeForms.orgId, orgId),
        eq(intakeForms.slug, ONBOARDING_SLUG),
      ),
    )
    .limit(1);

  if (existing) {
    return { formId: existing.id };
  }

  // Map IntakeQuestion → the simpler IntakeFormField shape the DB row uses.
  // options is omitted when undefined (not stored on the row for file/text
  // types); the full question metadata lives in ONBOARDING_QUESTIONS at
  // call time and will be threaded into the card renderer by the route.
  const fields = ONBOARDING_QUESTIONS.map((q) => ({
    key: q.id,
    label: q.label,
    type: q.type,
    required: q.required ?? false,
    ...(q.options ? { options: q.options } : {}),
  }));

  const [created] = await db
    .insert(intakeForms)
    .values({
      orgId,
      name: ONBOARDING_FORM_NAME,
      slug: ONBOARDING_SLUG,
      fields,
      settings: {
        // Friendly intro/outro copy. The /onboard/[token] renderer reads
        // these from settings because the Intake blueprint shape carries
        // title/description/completion at the Intake level, not inside
        // IntakeQuestion items.
        introTitle: "Let's build your new front office",
        introBody:
          "About 10 minutes. Upload what you have; skip the rest and we'll handle it.",
        outroTitle: "That's everything!",
        outroBody:
          "We're building your front office now — you'll get an email the moment it's ready.",
        theme: "dark",
        submitLabel: "Submit",
      },
      isActive: true,
    })
    .returning({ id: intakeForms.id });

  if (!created?.id) {
    throw new Error(`seedOnboardingForm: insert returned no id for org ${orgId}`);
  }

  return { formId: created.id };
}
