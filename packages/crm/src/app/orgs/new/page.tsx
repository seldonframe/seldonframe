import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { SetupWizard } from "@/components/soul/setup-wizard";
import { NewWorkspacePromptForm } from "@/components/orgs/new-workspace-prompt-form";
import coachingFramework from "@/lib/frameworks/coaching.json";
import agencyFramework from "@/lib/frameworks/agency.json";
import saasFramework from "@/lib/frameworks/saas.json";
import { listSavedFrameworkOptions } from "@/lib/frameworks/actions";
import { getWorkspaceLimitStatus } from "@/lib/billing/orgs";
import type { FrameworkOption } from "@/app/(onboarding)/setup/page";

const allFrameworks = [coachingFramework, agencyFramework, saasFramework];
const legacyWizard = false;

type CreateWorkspaceState = {
  error?: string;
  upgradeRequired?: boolean;
};

function getAppBaseUrl(host: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host.replace(/\/$/, "")}`;
}

function isUpgradeRequiredMessage(message?: string) {
  const lowered = message?.toLowerCase() ?? "";
  return (
    lowered.includes("pro plan required") ||
    lowered.includes("plan required") ||
    lowered.includes("used your free workspace") ||
    lowered.includes("additional workspace is $9/month") ||
    lowered.includes("organization limit reached") ||
    lowered.includes("workspace limit")
  );
}

export default async function NewWorkspacePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const limitStatus = await getWorkspaceLimitStatus();

  async function createWorkspaceAction(_prevState: CreateWorkspaceState, formData: FormData): Promise<CreateWorkspaceState> {
    "use server";

    const description = String(formData.get("description") ?? "").trim();
    if (!description) {
      return { error: "Describe your business or paste a URL." };
    }

    const claudeApiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!claudeApiKey) {
      return { error: "Anthropic is not configured for workspace generation." };
    }

    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "app.seldonframe.com";
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
    const cookieHeader = requestHeaders.get("cookie") ?? "";
    const appBaseUrl = getAppBaseUrl(`${protocol}://${host}`);

    const response = await fetch(`${appBaseUrl}/api/v1/workspace/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
        "x-claude-api-key": claudeApiKey,
      },
      body: JSON.stringify({ description }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          code?: string;
          workspace?: { id?: string; url?: string };
          dashboard_url?: string;
        }
      | null;

    if (!response.ok) {
      const errorMessage = payload?.error ?? "Failed to generate workspace.";
      const requiresUpgrade =
        payload?.code === "plan_required" ||
        payload?.code === "workspace_limit_reached" ||
        isUpgradeRequiredMessage(errorMessage);
      return {
        error: errorMessage,
        upgradeRequired: requiresUpgrade,
      };
    }

    const destination = payload?.dashboard_url || (payload?.workspace?.id ? `/dashboard?workspace=${payload.workspace.id}` : payload?.workspace?.url);

    if (!destination) {
      return { error: "Workspace created, but no redirect destination was returned." };
    }

    redirect(destination);
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

  if (!legacyWizard) {
    return (
      <main className="animate-page-enter flex-1 overflow-auto bg-background p-4 sm:p-6 md:p-8 w-full min-h-svh">
        <section className="mx-auto flex min-h-[74vh] max-w-5xl items-center justify-center">
          <div className="glass-card w-full max-w-3xl border border-border/70 p-6 sm:p-8 md:p-10">
            {limitStatus.canCreate ? (
              <div className="space-y-4 text-center">
                <h1 className="text-page-title">Create New Workspace</h1>
                <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Tell Seldon what you do, or paste a URL, and it will generate your complete operating system.
                </p>
              </div>
            ) : null}

            <div className={limitStatus.canCreate ? "mt-10" : "mt-2"}>
              <NewWorkspacePromptForm action={createWorkspaceAction} initialUpgradeRequired={!limitStatus.canCreate} />
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-background w-full min-h-svh">
      <SetupWizard frameworks={frameworks} createWorkspace completionRedirect="/dashboard" />
    </main>
  );
}
