import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/soul/setup-wizard";
import { listAvailableSouls, loadSoulPackage } from "@seldonframe/core/soul";

type SetupSoulOption = {
  id: string;
  name: string;
  description: string;
  previewImageUrl: string;
  includes: {
    landingPages: number;
    emails: number;
    formFields: number;
  };
  defaultBusinessName: string;
  wizardQuestions: Array<{
    question: string;
    type: string;
    options?: string[];
  }>;
  variants: Array<{
    title: string;
    headline: string;
    slug: string;
  }>;
  preview: {
    contactPlural: string;
    stages: string[];
    bookingType: string;
    bookingDuration: number;
    emailTemplateNames: string[];
  };
};

function normalizePreviewContactPlural(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text || /\{\{.*\}\}/.test(text)) {
    return "Contacts";
  }

  return text;
}

export default async function SetupPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const summaries = await listAvailableSouls();
  const souls: SetupSoulOption[] = [];

  for (const summary of summaries) {
    const pkg = await loadSoulPackage(summary.id);
    const config = pkg.config as {
      identity?: {
        defaultBusinessName?: string;
        entityLabels?: { contact?: { plural?: string } };
      };
      entityLabels?: { contact?: { plural?: string } };
      pipeline?: { stages?: Array<{ name?: string } | string> };
      bookingTypes?: Array<{ title?: string; durationMinutes?: number }>;
      emailTemplates?: Array<{ name?: string }>;
      wizardQuestions?: Array<{ question?: string; type?: string; options?: string[] }>;
      landingPageVariants?: Array<{ title?: string; slug?: string; sections?: Array<{ type?: string; content?: { headline?: string } }> }>;
    };

    souls.push({
      id: summary.id,
      name: summary.name,
      description: summary.description,
      previewImageUrl: `/souls/${summary.id}/preview.png`,
      includes: {
        landingPages: summary.landingPageCount,
        emails: summary.emailTemplateCount,
        formFields: summary.intakeFieldCount,
      },
      defaultBusinessName: config.identity?.defaultBusinessName ?? "",
      wizardQuestions: (config.wizardQuestions ?? [])
        .filter((item) => Boolean(item?.question))
        .slice(0, 2)
        .map((item) => ({
          question: String(item.question),
          type: String(item.type ?? "text"),
          options: Array.isArray(item.options) ? item.options.map((option) => String(option)) : undefined,
        })),
      variants: (config.landingPageVariants ?? []).map((variant) => {
        const hero = Array.isArray(variant.sections) ? variant.sections.find((section) => section.type === "hero") : undefined;
        return {
          title: String(variant.title ?? "Variant"),
          headline: String(hero?.content?.headline ?? ""),
          slug: String(variant.slug ?? ""),
        };
      }),
      preview: {
        contactPlural: normalizePreviewContactPlural(config.identity?.entityLabels?.contact?.plural ?? config.entityLabels?.contact?.plural),
        stages: Array.isArray(config.pipeline?.stages)
          ? config.pipeline.stages
              .map((stage) => (typeof stage === "string" ? stage : String(stage?.name ?? "")))
              .filter(Boolean)
          : [],
        bookingType: String(config.bookingTypes?.[0]?.title ?? "Consultation"),
        bookingDuration: Number(config.bookingTypes?.[0]?.durationMinutes ?? 30),
        emailTemplateNames: Array.isArray(config.emailTemplates)
          ? config.emailTemplates.map((template) => String(template.name ?? "Template")).filter(Boolean)
          : [],
      },
    });
  }

  return (
    <main className="crm-page animate-page-enter px-4 py-6 md:px-8">
      <SetupWizard souls={souls} />
    </main>
  );
}
