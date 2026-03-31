"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { installSoul } from "@/lib/soul/install";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

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

function answerKey(index: number) {
  return `question_${index}`;
}

function defaultBusinessNameForSoul(template: string, ownerName: string) {
  if (!template) {
    return ownerName ? `${ownerName} Studio` : "My Business";
  }

  return template.replace(/\{\{\s*ownerName\s*\}\}/g, ownerName || "Owner").replace(/\{\{\s*owner_name\s*\}\}/g, ownerName || "Owner");
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
  const progress = ((step + 1) / stepLabels.length) * 100;

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

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <article className="glass-card rounded-2xl p-6 md:p-8">
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Onboarding</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Step {step + 1} of {stepLabels.length}</p>
          </div>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted)/0.5)]">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {stepLabels.map((label, index) => (
              <div key={label} className="flex items-center gap-2">
                {index <= step ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Circle className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />}
                <span className={`text-xs ${index <= step ? "text-foreground" : "text-[hsl(var(--muted-foreground))]"}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {step === 0 ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Choose Your Soul</h1>
            <div className="grid gap-4 md:grid-cols-2">
              {souls.map((item) => {
                const active = selectedSoulId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectSoul(item.id)}
                    className={`rounded-xl border p-4 text-left transition ${
                      active ? "border-primary/40 bg-primary/10" : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] hover:border-primary/30"
                    }`}
                  >
                    <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                      <Image src={item.previewImageUrl} alt={item.name} width={640} height={256} className="h-32 w-full object-cover" />
                    </div>
                    <p className="mt-3 text-base font-medium text-foreground">{item.name}</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">{item.description || "Niche-ready business system"}</p>
                    <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                      Includes: {item.includes.landingPages} landing pages, {item.includes.emails} emails, {item.includes.formFields} form fields
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              If none fit, <button type="button" className="underline underline-offset-4" onClick={() => router.push("/dashboard")}>start from scratch</button>.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Make It Yours</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{selectedSoul?.name}</p>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-[hsl(var(--muted-foreground))]">
                Your full name
                <input className="crm-input mt-2 h-11 w-full px-3" value={fullName} onChange={(event) => {
                  const value = event.target.value;
                  setFullName(value);
                  if (!businessName && selectedSoul) {
                    const firstName = value.trim().split(" ").filter(Boolean)[0] ?? "";
                    setBusinessName(defaultBusinessNameForSoul(selectedSoul.defaultBusinessName, firstName));
                  }
                }} placeholder="Alex Smith" />
              </label>

              <label className="block text-sm text-[hsl(var(--muted-foreground))]">
                Your business name
                <input className="crm-input mt-2 h-11 w-full px-3" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Smith Therapy" />
              </label>
            </div>

            <label className="block text-sm text-[hsl(var(--muted-foreground))]">
              Your location (optional)
              <input className="crm-input mt-2 h-11 w-full px-3" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Austin, TX" />
            </label>

            <div className="grid gap-3">
              {(selectedSoul?.wizardQuestions ?? []).map((question, index) => (
                <label key={`${question.question}-${index}`} className="block text-sm text-[hsl(var(--muted-foreground))]">
                  {question.question}
                  {question.type.includes("select") && question.options?.length ? (
                    <select className="crm-input mt-2 h-11 w-full px-3" value={questionAnswers[answerKey(index)] ?? ""} onChange={(event) => setAnswer(index, event.target.value)}>
                      <option value="">Select an option</option>
                      {question.options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="crm-input mt-2 h-11 w-full px-3" value={questionAnswers[answerKey(index)] ?? ""} onChange={(event) => setAnswer(index, event.target.value)} placeholder="Your answer" />
                  )}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 && !installed ? (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Your Business is Ready</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">We&apos;ll install your soul package and reveal your live business system instantly.</p>
            <button type="button" className="crm-button-primary h-11 px-5" onClick={launchBusiness} disabled={pending}>
              {pending ? "Launching..." : "Launch My Business"}
            </button>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>
        ) : null}

        {step === 2 && installed ? (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Your business is ready, {fullName.split(" ")[0] || "there"}</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Here&apos;s what we just built for you.</p>

            <div className="grid gap-3 md:grid-cols-2">
              <Link href="/dashboard" className="glass-card rounded-xl p-4">
                <p className="font-medium text-foreground">Dashboard</p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Good morning, {fullName.split(" ")[0] || "there"}</p>
              </Link>
              <Link href="/contacts" className="glass-card rounded-xl p-4">
                <p className="font-medium text-foreground">{selectedSoul?.preview.contactPlural || "Contacts"} CRM</p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  Pipeline: {(selectedSoul?.preview.stages ?? []).slice(0, 4).join(" → ")}
                </p>
              </Link>
              <Link href="/landing" className="glass-card rounded-xl p-4">
                <p className="font-medium text-foreground">Landing Page</p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{selectedSoul?.variants[0]?.headline || "Your hero section is ready"}</p>
              </Link>
              <Link href="/bookings" className="glass-card rounded-xl p-4">
                <p className="font-medium text-foreground">Booking Page</p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{selectedSoul?.preview.bookingType} — {selectedSoul?.preview.bookingDuration} min</p>
              </Link>
              <Link href="/emails" className="glass-card rounded-xl p-4">
                <p className="font-medium text-foreground">Email Templates</p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{selectedSoul?.preview.emailTemplateNames.length || 0} templates active</p>
              </Link>
              <Link href="/forms" className="glass-card rounded-xl p-4">
                <p className="font-medium text-foreground">Intake Form</p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{selectedSoul?.includes.formFields || 0} fields — ready to share</p>
              </Link>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
              <Sparkles className="mr-2 inline h-4 w-4" />
              Everything above is live and editable.
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Choose Your Look</h2>
            {(selectedSoul?.variants.length ?? 0) > 1 ? (
              <div className="grid gap-3 md:grid-cols-3">
                {(selectedSoul?.variants ?? []).map((variant, index) => {
                  const active = selectedVariantIndex === index;
                  return (
                    <button
                      key={`${variant.slug}-${index}`}
                      type="button"
                      onClick={() => setSelectedVariantIndex(index)}
                      className={`rounded-xl border p-4 text-left transition ${active ? "border-primary/40 bg-primary/10" : "border-[hsl(var(--border))]"}`}
                    >
                      <p className="font-medium text-foreground">{variant.title}</p>
                      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{variant.headline || "Variant preview"}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">This soul currently has one default landing style.</p>
            )}
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button type="button" className="crm-button-secondary h-10 px-4" onClick={goBack} disabled={step === 0 || pending}>
            Back
          </button>

          {step < 2 ? (
            <button type="button" className="crm-button-primary h-10 px-4" onClick={goNext} disabled={!canContinue || pending}>
              Continue <ArrowRight className="ml-1 inline h-4 w-4" />
            </button>
          ) : step === 2 ? (
            <button type="button" className="crm-button-primary h-10 px-4" onClick={goNext} disabled={!installed || pending}>
              {(selectedSoul?.variants.length ?? 0) > 1 ? "Continue" : "Go to Dashboard"} <ArrowRight className="ml-1 inline h-4 w-4" />
            </button>
          ) : (
            <button type="button" className="crm-button-primary h-11 px-5" onClick={finishWithVariant}>
              Finish Setup
            </button>
          )}
        </div>
      </article>
    </section>
  );
}
