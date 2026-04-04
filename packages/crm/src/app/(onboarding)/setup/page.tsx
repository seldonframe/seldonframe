import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/soul/setup-wizard";
import coachingFramework from "@/lib/frameworks/coaching.json";
import agencyFramework from "@/lib/frameworks/agency.json";
import saasFramework from "@/lib/frameworks/saas.json";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/content.tsx
    - content shell: "flex-1 overflow-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-background w-full"
*/

export type FrameworkOption = {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultBusinessName: string;
  contactLabel: { singular: string; plural: string };
  pipeline: Array<{ name: string; order: number }>;
  bookingTypes: Array<{ name: string; slug: string; durationMinutes: number }>;
  emailTemplates: Array<{ name: string; tag: string }>;
  intakeFormFieldCount: number;
  landingPage: { headline: string; subhead: string; cta: string };
};

const allFrameworks = [coachingFramework, agencyFramework, saasFramework];

export default async function SetupPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const frameworks: FrameworkOption[] = allFrameworks.map((fw) => ({
    id: fw.id,
    name: fw.name,
    description: fw.description,
    icon: fw.icon,
    defaultBusinessName: fw.defaultBusinessName,
    contactLabel: fw.contactLabel,
    pipeline: fw.pipeline,
    bookingTypes: fw.bookingTypes.map((bt) => ({ name: bt.name, slug: bt.slug, durationMinutes: bt.durationMinutes })),
    emailTemplates: fw.emailTemplates.map((et) => ({ name: et.name, tag: et.tag })),
    intakeFormFieldCount: fw.intakeForm.fields.length,
    landingPage: fw.landingPage,
  }));

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-background w-full">
      <SetupWizard frameworks={frameworks} />
    </main>
  );
}
