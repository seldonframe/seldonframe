import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/soul/setup-wizard";
import coachingFramework from "@/lib/frameworks/coaching.json";
import agencyFramework from "@/lib/frameworks/agency.json";
import saasFramework from "@/lib/frameworks/saas.json";
import { listSavedFrameworkOptions } from "@/lib/frameworks/actions";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/content.tsx
    - content shell: "flex-1 overflow-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-background w-full"
*/

export type AutomationSuggestion = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  templateTag?: string;
  requiresIntegration: string;
  defaultEnabled: boolean;
};

export type FrameworkOption = {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultBusinessName: string;
  contactLabel: { singular: string; plural: string };
  dealLabel: { singular: string; plural: string };
  pipeline: Array<{ name: string; order: number }>;
  bookingTypes: Array<{ name: string; slug: string; durationMinutes: number; price: number }>;
  emailTemplates: Array<{ name: string; tag: string }>;
  intakeFormFieldCount: number;
  landingPage: { headline: string; subhead: string; cta: string };
  seldonExamples: Array<{
    block: string;
    icon: string;
    label: string;
    prompt: string;
    description: string;
  }>;
  automationSuggestions: AutomationSuggestion[];
  readme?: {
    overview: string;
    whyThisPipeline: string;
    whyTheseEmails: string;
    whyTheseBookings: string;
    whyTheseAutomations: string;
  };
};

const allFrameworks = [coachingFramework, agencyFramework, saasFramework];

export default async function SetupPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const baseFrameworks: FrameworkOption[] = allFrameworks.map((fw) => ({
    id: fw.id,
    name: fw.name,
    description: fw.description,
    icon: fw.icon,
    defaultBusinessName: fw.defaultBusinessName,
    contactLabel: fw.contactLabel,
    dealLabel: fw.dealLabel,
    pipeline: fw.pipeline,
    bookingTypes: fw.bookingTypes.map((bt) => ({ name: bt.name, slug: bt.slug, durationMinutes: bt.durationMinutes, price: bt.price })),
    emailTemplates: fw.emailTemplates.map((et) => ({ name: et.name, tag: et.tag })),
    intakeFormFieldCount: fw.intakeForm.fields.length,
    landingPage: fw.landingPage,
    seldonExamples: (fw.seldonExamples ?? []).map((item) => ({
      block: item.block,
      icon: item.icon,
      label: item.label,
      prompt: item.prompt,
      description: item.description,
    })),
    automationSuggestions: fw.automationSuggestions.map((a) => ({
      id: a.id,
      name: a.name,
      trigger: a.trigger,
      action: a.action,
      templateTag: a.templateTag,
      requiresIntegration: a.requiresIntegration,
      defaultEnabled: a.defaultEnabled,
    })),
    readme: fw.readme,
  }));

  const savedFrameworks = await listSavedFrameworkOptions();
  const frameworks: FrameworkOption[] = [...savedFrameworks, ...baseFrameworks.filter((fw) => !savedFrameworks.some((saved) => saved.id === fw.id))];

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-background w-full min-h-svh">
      <SetupWizard frameworks={frameworks} />
    </main>
  );
}
