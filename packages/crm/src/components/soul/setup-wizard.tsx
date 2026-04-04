"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  LayoutDashboard,
  Users,
  Globe,
  Calendar,
  Mail,
  FileText,
  Sparkles,
  Rocket,
  Loader2,
  Heart,
  Building2,
} from "lucide-react";
import { installSoul } from "@/lib/soul/install";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import type { FrameworkOption } from "@/app/(onboarding)/setup/page";

/*
  Square UI class reference (source of truth):
  - templates/files/components/files/folder-grid.tsx
    - card: "p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all cursor-pointer group"
  - templates/dashboard-2/components/dashboard/stats-cards.tsx
    - grid: "grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 p-3 sm:p-4 lg:p-6 rounded-xl border bg-card"
*/

const TOTAL_STEPS = 4;

const squareInputClass = "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";
const squarePrimaryButtonClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground text-sm font-medium transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 outline-none";
const squareOutlineButtonClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background text-sm font-medium shadow-xs transition-all hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 outline-none";

const frameworkIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Heart,
  Building2,
  Rocket,
};

function resolveBusinessName(template: string, ownerName: string) {
  if (!template) {
    return ownerName ? `${ownerName} Studio` : "My Business";
  }

  return template.replace(/\{\{\s*ownerName\s*\}\}/g, ownerName || "Owner");
}

function StepDots({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: TOTAL_STEPS }).map((_, index) => {
        const isDone = index < currentStep;
        const isActive = index === currentStep;
        const isSparkle = index === TOTAL_STEPS - 1;

        return (
          <div
            key={index}
            className={`flex items-center justify-center rounded-full transition-all ${
              isDone
                ? "size-7 bg-primary text-primary-foreground"
                : isActive
                  ? "size-7 bg-primary text-primary-foreground ring-4 ring-primary/20"
                  : "size-7 bg-muted text-muted-foreground"
            }`}
          >
            {isDone ? (
              <Check className="size-3.5" />
            ) : isSparkle ? (
              <Sparkles className="size-3.5" />
            ) : (
              <span className="text-xs font-semibold">{index + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepTransition({ children, stepKey }: { children: React.ReactNode; stepKey: string }) {
  return (
    <div key={stepKey} className="animate-in fade-in slide-in-from-right-4 duration-300">
      {children}
    </div>
  );
}

export function SetupWizard({ frameworks }: { frameworks: FrameworkOption[] }) {
  const router = useRouter();
  const { showDemoToast } = useDemoToast();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>("");
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFramework = useMemo(
    () => frameworks.find((fw) => fw.id === selectedFrameworkId) ?? null,
    [selectedFrameworkId, frameworks],
  );

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(selectedFramework);
    if (step === 1) return businessName.trim().length > 1;
    if (step === 2) return installed;
    return true;
  }, [businessName, installed, selectedFramework, step]);

  function onSelectFramework(id: string) {
    setSelectedFrameworkId(id);
    const fw = frameworks.find((item) => item.id === id);
    if (fw && !businessName.trim()) {
      setBusinessName(resolveBusinessName(fw.defaultBusinessName, ""));
    }
  }

  function goNext() {
    if (!canContinue || pending) return;
    if (step === 2) {
      router.push("/dashboard?fromSetup=1");
      return;
    }
    setStep((current) => Math.min(current + 1, TOTAL_STEPS - 1));
  }

  function goBack() {
    if (pending) return;
    setStep((current) => Math.max(current - 1, 0));
  }

  function launchBusiness() {
    setError(null);

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        const ownerName = businessName.split(" ")[0] || "";

        await installSoul({
          frameworkId: selectedFramework!.id,
          answers: {
            ownerName,
            ownerFullName: ownerName,
            businessName,
            location,
          },
          markCompleted: true,
        });

        setInstalled(true);
      } catch (cause) {
        if (isDemoBlockedError(cause)) {
          showDemoToast();
          return;
        }

        setError("Unable to launch your business. Please try again.");
      }
    });
  }

  const revealCards = [
    {
      href: "/dashboard",
      icon: LayoutDashboard,
      title: "Dashboard",
      description: "Your command center is live",
    },
    {
      href: "/contacts",
      icon: Users,
      title: `${selectedFramework?.contactLabel.plural || "Contacts"} CRM`,
      description: `${selectedFramework?.pipeline.length || 0}-stage pipeline`,
    },
    {
      href: "/landing",
      icon: Globe,
      title: "Landing Page",
      description: selectedFramework?.landingPage.headline || "Hero section ready",
    },
    {
      href: "/bookings",
      icon: Calendar,
      title: "Booking Page",
      description: `${selectedFramework?.bookingTypes[0]?.name || "Consultation"} — ${selectedFramework?.bookingTypes[0]?.durationMinutes || 30} min`,
    },
    {
      href: "/emails",
      icon: Mail,
      title: "Email Templates",
      description: `${selectedFramework?.emailTemplates.length || 0} templates active`,
    },
    {
      href: "/forms",
      icon: FileText,
      title: "Intake Form",
      description: `${selectedFramework?.intakeFormFieldCount || 0} fields — ready to share`,
    },
  ];

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-0">
      <div className="ring-foreground/10 rounded-xl border bg-card p-5 text-card-foreground shadow-xs ring-1 sm:p-8 md:p-10">
        <div className="mb-8">
          <StepDots currentStep={step} />
        </div>

        {step === 0 ? (
          <StepTransition stepKey="step-0">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Choose Your Framework</h1>
                <p className="text-sm text-muted-foreground">Pick the template closest to your business. We&apos;ll build your entire system from it.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {frameworks.map((fw) => {
                  const active = selectedFrameworkId === fw.id;
                  const IconComponent = frameworkIcons[fw.icon] ?? Rocket;
                  return (
                    <button
                      key={fw.id}
                      type="button"
                      onClick={() => onSelectFramework(fw.id)}
                      className={`p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all cursor-pointer group text-left ${
                        active ? "ring-2 ring-primary border-primary/40" : ""
                      }`}
                    >
                      <div className="size-10 rounded-lg flex items-center justify-center mb-3 bg-muted">
                        <IconComponent className="size-5 text-muted-foreground" />
                      </div>
                      <p className="font-medium text-sm truncate mb-0.5">{fw.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{fw.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {fw.pipeline.length} stages · {fw.emailTemplates.length} emails · {fw.intakeFormFieldCount} fields
                      </p>
                      {active ? (
                        <span className="mt-2 inline-flex items-center rounded-full px-2 py-1 text-xs bg-primary/10 text-primary w-fit">
                          Selected
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <p className="text-sm text-muted-foreground text-center">
                None fit?{" "}
                <Link
                  href="/dashboard"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Start from scratch
                </Link>
              </p>
            </div>
          </StepTransition>
        ) : null}

        {step === 1 ? (
          <StepTransition stepKey="step-1">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Name Your Business</h2>
                <p className="text-sm text-muted-foreground">
                  Setting up <span className="font-medium text-foreground">{selectedFramework?.name}</span>
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="font-medium text-base">Business details</h3>
                </div>

                <div className="space-y-5 p-4">
                  <div className="space-y-2">
                    <label htmlFor="setup-bizname" className="text-sm font-medium text-foreground">Business name</label>
                    <input
                      id="setup-bizname"
                      className={squareInputClass}
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                      placeholder="Acme Coaching"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="setup-location" className="text-sm font-medium text-foreground">
                      Location <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <input
                      id="setup-location"
                      className={squareInputClass}
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="Austin, TX"
                    />
                  </div>
                </div>
              </div>
            </div>
          </StepTransition>
        ) : null}

        {step === 2 && !installed ? (
          <StepTransition stepKey="step-2-launch">
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Rocket className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-md">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Ready to Launch</h2>
                <p className="text-sm text-muted-foreground">
                  We&apos;ll create your pipeline, booking page, email templates, intake form, and landing page — all in one click.
                </p>
              </div>
              <button
                type="button"
                className={`${squarePrimaryButtonClass} relative h-12 px-8 text-base`}
                onClick={launchBusiness}
                disabled={pending}
              >
                {pending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Building your business...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Launch My Business
                  </span>
                )}
              </button>
              {error ? <p className="text-sm text-red-500">{error}</p> : null}
            </div>
          </StepTransition>
        ) : null}

        {step === 2 && installed ? (
          <StepTransition stepKey="step-2-reveal">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <Check className="h-6 w-6 text-emerald-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                  {businessName || "Your business"} is live
                </h2>
                <p className="text-sm text-muted-foreground">Here&apos;s what we just built for you.</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border bg-card">
                {revealCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link key={card.href} href={card.href} className="flex items-start group">
                      <div className="flex-1 space-y-2 sm:space-y-3">
                        <div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground">
                          <Icon className="size-3.5 sm:size-[18px]" />
                          <span className="text-[10px] sm:text-xs font-medium truncate">{card.title}</span>
                        </div>
                        <p className="text-base sm:text-lg font-semibold leading-tight tracking-tight text-emerald-600">Live</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1">{card.description}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0" />
                Everything above is live and editable.
              </div>
            </div>
          </StepTransition>
        ) : null}

        {step === 3 ? (
          <StepTransition stepKey="step-3">
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Power Up Your Soul</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Answer a few optional questions to unlock automations and deeper personalization. You can do this anytime from your dashboard.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/dashboard/soul-deepener?fromSetup=1"
                  className={`${squarePrimaryButtonClass} h-10 px-6`}
                >
                  <Sparkles className="h-4 w-4" />
                  Set Up Automations
                </Link>
                <button
                  type="button"
                  className={`${squareOutlineButtonClass} h-10 px-6`}
                  onClick={() => router.push("/dashboard?fromSetup=1")}
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </StepTransition>
        ) : null}

        <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
          <button
            type="button"
            className={`${squareOutlineButtonClass} h-9 px-4 py-2`}
            onClick={goBack}
            disabled={step === 0 || pending}
          >
            Back
          </button>

          {step < 2 ? (
            <button
              type="button"
              className={`${squarePrimaryButtonClass} h-9 px-5 py-2`}
              onClick={goNext}
              disabled={!canContinue || pending}
            >
              Continue <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          ) : step === 2 && installed ? (
            <button
              type="button"
              className={`${squarePrimaryButtonClass} h-9 px-5 py-2`}
              onClick={goNext}
            >
              Continue <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          ) : step === 3 ? (
            <button
              type="button"
              className={`${squarePrimaryButtonClass} h-10 px-6`}
              onClick={() => router.push("/dashboard?fromSetup=1")}
            >
              Go to Dashboard <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
