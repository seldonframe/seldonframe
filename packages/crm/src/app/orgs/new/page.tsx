import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SetupWizard } from "@/components/soul/setup-wizard";
import { getPlan } from "@/lib/billing/plans";
import coachingFramework from "@/lib/frameworks/coaching.json";
import agencyFramework from "@/lib/frameworks/agency.json";
import saasFramework from "@/lib/frameworks/saas.json";
import { listSavedFrameworkOptions } from "@/lib/frameworks/actions";
import { getWorkspaceLimitStatus } from "@/lib/billing/orgs";
import type { FrameworkOption } from "@/app/(onboarding)/setup/page";

const allFrameworks = [coachingFramework, agencyFramework, saasFramework];

export default async function NewWorkspacePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const plan = getPlan(session.user.planId ?? "");

  if (!plan || plan.type !== "pro") {
    redirect("/dashboard");
  }

  const limitStatus = await getWorkspaceLimitStatus();

  if (!limitStatus.canCreate) {
    redirect("/orgs?limit=1");
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
  }));

  const savedFrameworks = await listSavedFrameworkOptions();
  const frameworks: FrameworkOption[] = [...savedFrameworks, ...baseFrameworks.filter((fw) => !savedFrameworks.some((saved) => saved.id === fw.id))];

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-background w-full min-h-svh">
      <SetupWizard frameworks={frameworks} createWorkspace completionRedirect="/dashboard" />
    </main>
  );
}
