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
} from "lucide-react";
import { installSoul } from "@/lib/soul/install";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

/*
  Square UI class reference (source of truth):
  - templates-baseui/marketing-dashboard/components/ui/progress.tsx
    - progress track: "bg-muted h-1.5 rounded-full relative flex w-full items-center overflow-x-hidden"
    - progress indicator: "bg-primary h-full transition-all"
  - templates-baseui/marketing-dashboard/components/ui/card.tsx
    - shell: "bg-card text-card-foreground ... rounded-xl ... shadow-xs ring-1 ring-foreground/10"
*/

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

const stepLabels = ["Choose Your Soul", "Personalize", "Your Business Is Ready", "Choose Your Look"];

const squareInputClass = "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";
const squarePrimaryButtonClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground text-sm font-medium transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 outline-none";
const squareOutlineButtonClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background text-sm font-medium shadow-xs transition-all hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 outline-none";

function answerKey(index: number) {
  return `question_${index}`;
}

function defaultBusinessNameForSoul(template: string, ownerName: string) {
  if (!template) {
    return ownerName ? `${ownerName} Studio` : "My Business";
  }

  return template.replace(/\{\{\s*ownerName\s*\}\}/g, ownerName || "Owner").replace(/\{\{\s*owner_name\s*\}\}/g, ownerName || "Owner");
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex w-full items-center gap-2">
      {stepLabels.map((label, index) => {
        const isDone = index < currentStep;
        const isActive = index === currentStep;
        return (
          <div
            key={label}
            className={`inline-flex flex-1 items-center justify-center gap-2 h-9 px-3 rounded-md border text-sm font-medium shadow-xs ${
              isDone || isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            <span className="text-xs font-semibold">{isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
            <span className="hidden sm:inline truncate">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function StepTransition({ children, stepKey }: { children: React.ReactNode; stepKey: string }) {
  return (
    <div
      key={stepKey}
      className="animate-in fade-in slide-in-from-right-4 duration-300"
    >
      {children}
    </div>
  );
}

export function SetupWizard({ souls }: { souls: SetupSoulOption[] }) {
  const router = useRouter();
  const { showDemoToast } = useDemoToast();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [selectedSoulId, setSelectedSoulId] = useState<string>(souls[0]?.id ?? "");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [installed, setInstalled] = useState(false);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const selectedSoul = useMemo(() => souls.find((item) => item.id === selectedSoulId) ?? souls[0], [selectedSoulId, souls]);

  const canContinue = useMemo(() => {
    if (step === 0) {
      return Boolean(selectedSoul);
    }

    if (step === 1) {
      return fullName.trim().length > 1 && businessName.trim().length > 1;
    }

    if (step === 2) {
      return installed;
    }

    return true;
  }, [businessName, fullName, installed, selectedSoul, step]);

  function setAnswer(index: number, value: string) {
    setQuestionAnswers((current) => ({
      ...current,
      [answerKey(index)]: value,
    }));
  }

  function onSelectSoul(soulId: string) {
    setSelectedSoulId(soulId);
    const soul = souls.find((item) => item.id === soulId);
    if (!soul) {
      return;
    }

    const firstName = fullName.trim().split(" ").filter(Boolean)[0] ?? "";
    const suggested = defaultBusinessNameForSoul(soul.defaultBusinessName, firstName);
    if (!businessName.trim()) {
      setBusinessName(suggested);
    }
  }

  function goNext() {
    if (!canContinue || pending) {
      return;
    }

    if (step === 2 && selectedSoul?.variants.length <= 1) {
      router.push("/dashboard?fromSetup=1");
      return;
    }

    setStep((current) => Math.min(current + 1, stepLabels.length - 1));
  }

  function goBack() {
    if (pending) {
      return;
    }

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

        const firstName = fullName.trim().split(" ").filter(Boolean)[0] ?? "";
        const wizardPayload: Record<string, unknown> = {
          ownerFullName: fullName,
          ownerFirstName: firstName,
          ownerName: firstName,
          businessName,
          location,
          specialty: questionAnswers[answerKey(0)] || "",
        };

        selectedSoul?.wizardQuestions.forEach((question, index) => {
          wizardPayload[`wizardQuestion${index + 1}`] = questionAnswers[answerKey(index)] || "";
        });

        await installSoul({
          soulId: selectedSoul.id,
          answers: wizardPayload,
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

  function finishWithVariant() {
    router.push("/dashboard?fromSetup=1");
  }

  const revealCards = [
    {
      href: "/dashboard",
      icon: LayoutDashboard,
      title: "Dashboard",
      description: `Good morning, ${fullName.split(" ")[0] || "there"}`,
    },
    {
      href: "/contacts",
      icon: Users,
      title: `${selectedSoul?.preview.contactPlural || "Contacts"} CRM`,
      description: `Pipeline: ${(selectedSoul?.preview.stages ?? []).slice(0, 4).join(" → ")}`,
    },
    {
      href: "/landing",
      icon: Globe,
      title: "Landing Page",
      description: selectedSoul?.variants[0]?.headline || "Your hero section is ready",
    },
    {
      href: "/bookings",
      icon: Calendar,
      title: "Booking Page",
      description: `${selectedSoul?.preview.bookingType} — ${selectedSoul?.preview.bookingDuration} min`,
    },
    {
      href: "/emails",
      icon: Mail,
      title: "Email Templates",
      description: `${selectedSoul?.preview.emailTemplateNames.length || 0} templates active`,
    },
    {
      href: "/forms",
      icon: FileText,
      title: "Intake Form",
      description: `${selectedSoul?.includes.formFields || 0} fields — ready to share`,
    },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-0">
      <div className="ring-foreground/10 rounded-xl border bg-card p-5 text-card-foreground shadow-xs ring-1 sm:p-8 md:p-10">
        <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <StepIndicator currentStep={step} />
          <p className="text-xs text-muted-foreground sm:hidden">Step {step + 1} of {stepLabels.length}</p>
        </div>

        {step === 0 ? (
          <StepTransition stepKey="step-0">
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Choose Your Soul</h1>
                <p className="text-sm text-muted-foreground">Pick a niche template. We&apos;ll build your entire business system from it.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {souls.map((item) => {
                  const active = selectedSoulId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectSoul(item.id)}
                      className={`p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all cursor-pointer group text-left ${
                        active
                          ? "ring-2 ring-primary border-primary/40"
                          : ""
                      }`}
                    >
                      <div className="size-10 rounded-lg flex items-center justify-center mb-3 bg-muted overflow-hidden">
                        <img
                          src={item.previewImageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = "/logo.svg";
                            event.currentTarget.className = "h-6 w-6 object-contain opacity-40";
                          }}
                        />
                      </div>
                      <p className="font-medium text-sm truncate mb-0.5">{item.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.description || "Niche-ready business system"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.includes.landingPages} pages · {item.includes.emails} emails · {item.includes.formFields} fields
                      </p>
                      {active ? <span className="mt-2 inline-flex items-center rounded-full px-2 py-1 text-xs bg-primary/10 text-primary w-fit">Selected</span> : null}
                    </button>
                  );
                })}
              </div>

              <p className="text-sm text-muted-foreground">
                None fit?{" "}
                <Link
                  href="/dashboard"
                  className="pointer-events-auto relative z-10 inline-flex text-primary underline underline-offset-4 hover:text-primary/80"
                  onClick={(event) => event.stopPropagation()}
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
              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Make It Yours</h2>
                <p className="text-sm text-muted-foreground">Personalizing for <span className="font-medium text-foreground">{selectedSoul?.name}</span></p>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b">
                  <h3 className="font-medium text-base">Business details</h3>
                </div>

                <div className="space-y-5 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="setup-fullname" className="text-sm font-medium text-foreground">Your full name</label>
                    <input
                      id="setup-fullname"
                      className={squareInputClass}
                      value={fullName}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFullName(value);
                        if (!businessName && selectedSoul) {
                          const firstName = value.trim().split(" ").filter(Boolean)[0] ?? "";
                          setBusinessName(defaultBusinessNameForSoul(selectedSoul.defaultBusinessName, firstName));
                        }
                      }}
                      placeholder="Alex Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="setup-bizname" className="text-sm font-medium text-foreground">Your business name</label>
                    <input
                      id="setup-bizname"
                      className={squareInputClass}
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                      placeholder="Smith Therapy"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="setup-location" className="text-sm font-medium text-foreground">
                    Your location <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    id="setup-location"
                    className={squareInputClass}
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Austin, TX"
                  />
                </div>

                {(selectedSoul?.wizardQuestions ?? []).map((question, index) => (
                  <div key={`${question.question}-${index}`} className="space-y-2">
                    <label htmlFor={`setup-q-${index}`} className="text-sm font-medium text-foreground">{question.question}</label>
                    {question.type.includes("select") && question.options?.length ? (
                      <select
                        id={`setup-q-${index}`}
                        className={squareInputClass}
                        value={questionAnswers[answerKey(index)] ?? ""}
                        onChange={(event) => setAnswer(index, event.target.value)}
                      >
                        <option value="">Select an option</option>
                        {question.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`setup-q-${index}`}
                        className={squareInputClass}
                        value={questionAnswers[answerKey(index)] ?? ""}
                        onChange={(event) => setAnswer(index, event.target.value)}
                        placeholder="Your answer"
                      />
                    )}
                  </div>
                ))}
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
                <p className="text-sm text-muted-foreground">We&apos;ll install your soul package and reveal your live business system instantly.</p>
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
                    Launching your business...
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
                  Your business is ready, {fullName.split(" ")[0] || "there"}
                </h2>
                <p className="text-sm text-muted-foreground">Here&apos;s what we just built for you.</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 p-3 sm:p-4 lg:p-6 rounded-xl border bg-card">
                {revealCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="flex items-start group"
                    >
                      <div className="flex-1 space-y-2 sm:space-y-4 lg:space-y-6">
                        <div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground">
                          <Icon className="size-3.5 sm:size-[18px]" />
                          <span className="text-[10px] sm:text-xs lg:text-sm font-medium truncate">{card.title}</span>
                        </div>
                        <p className="text-lg sm:text-xl lg:text-[28px] font-semibold leading-tight tracking-tight">Live</p>
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-xs lg:text-sm font-medium">
                          <span className="text-emerald-600">Ready</span>
                          <span className="text-muted-foreground hidden sm:inline line-clamp-1">{card.description}</span>
                        </div>
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
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Choose Your Look</h2>
                <p className="text-sm text-muted-foreground">Select a landing page variant for your business.</p>
              </div>
              {(selectedSoul?.variants.length ?? 0) > 1 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(selectedSoul?.variants ?? []).map((variant, index) => {
                    const active = selectedVariantIndex === index;
                    return (
                      <button
                        key={`${variant.slug}-${index}`}
                        type="button"
                        onClick={() => setSelectedVariantIndex(index)}
                        className={`group relative flex flex-col rounded-xl border bg-card overflow-hidden hover:bg-accent/30 transition-colors text-left ${
                          active
                            ? "ring-2 ring-primary border-primary/40"
                            : ""
                        }`}
                      >
                        <div className="h-32 bg-linear-to-br from-muted/50 to-muted flex items-center justify-center">
                          <div className="size-12 rounded-xl bg-background shadow-sm flex items-center justify-center">
                            <Globe className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-medium line-clamp-1">{variant.title}</h3>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{variant.headline || "Variant preview"}</p>
                          {active ? <span className="inline-flex items-center rounded-full px-2 py-1 text-xs bg-primary/10 text-primary">Selected</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border bg-card p-6 text-center text-card-foreground shadow-sm">
                  <p className="text-sm text-muted-foreground">This soul currently has one default landing style.</p>
                </div>
              )}
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
            <button type="button" className={`${squarePrimaryButtonClass} h-9 px-5 py-2`} onClick={goNext} disabled={!canContinue || pending}>
              Continue <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          ) : step === 2 ? (
            <button type="button" className={`${squarePrimaryButtonClass} h-9 px-5 py-2`} onClick={goNext} disabled={!installed || pending}>
              {(selectedSoul?.variants.length ?? 0) > 1 ? "Continue" : "Go to Dashboard"} <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          ) : (
            <button type="button" className={`${squarePrimaryButtonClass} h-10 px-6`} onClick={finishWithVariant}>
              Finish Setup <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
