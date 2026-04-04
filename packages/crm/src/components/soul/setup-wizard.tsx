"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
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
  Zap,
  MessageSquare,
  CreditCard,
} from "lucide-react";
import { installSoul } from "@/lib/soul/install";
import { saveIntegrationFromWizard } from "@/lib/integrations/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import type { FrameworkOption } from "@/app/(onboarding)/setup/page";

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Framework", "Business", "Connect", "Launch"];

const squareInputClass = "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";
const squareTextareaClass = "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none";
const squarePrimaryButtonClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground text-sm font-medium transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 outline-none";
const squareOutlineButtonClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background text-sm font-medium shadow-xs transition-all hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 outline-none";

const frameworkIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Heart,
  Building2,
  Rocket,
};

const integrationMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  resend: { label: "Resend", icon: Mail, description: "Email delivery" },
  twilio: { label: "Twilio", icon: MessageSquare, description: "SMS messages" },
  stripe: { label: "Stripe", icon: CreditCard, description: "Payments" },
  google: { label: "Google Calendar", icon: Calendar, description: "Booking sync" },
};

function resolveBusinessName(template: string, ownerName: string) {
  if (!template) return ownerName ? `${ownerName} Studio` : "My Business";
  return template.replace(/\{\{\s*ownerName\s*\}\}/g, ownerName || "Owner");
}

function StepDots({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEP_LABELS.map((label, index) => {
        const isDone = index < currentStep;
        const isActive = index === currentStep;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <div
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
              ) : (
                <span className="text-xs font-semibold">{index + 1}</span>
              )}
            </div>
            <span className={`hidden sm:inline text-xs font-medium ${isActive || isDone ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
            {index < TOTAL_STEPS - 1 ? <div className="hidden sm:block w-6 h-px bg-border" /> : null}
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

type IntegrationState = {
  resend: { apiKey: string; fromEmail: string; fromName: string; connected: boolean; saving: boolean };
  twilio: { accountSid: string; authToken: string; fromNumber: string; connected: boolean; saving: boolean };
};

export function SetupWizard({ frameworks }: { frameworks: FrameworkOption[] }) {
  const router = useRouter();
  const { showDemoToast } = useDemoToast();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  // Step 0
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>("");
  const [expandedFramework, setExpandedFramework] = useState<string | null>(null);

  // Step 1
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [journeyDescription, setJourneyDescription] = useState("");
  const [enabledAutomations, setEnabledAutomations] = useState<Set<string>>(new Set());
  const [automationsInitialized, setAutomationsInitialized] = useState(false);

  // Step 2
  const [integrations, setIntegrations] = useState<IntegrationState>({
    resend: { apiKey: "", fromEmail: "", fromName: "", connected: false, saving: false },
    twilio: { accountSid: "", authToken: "", fromNumber: "", connected: false, saving: false },
  });

  // Step 3
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFramework = useMemo(
    () => frameworks.find((fw) => fw.id === selectedFrameworkId) ?? null,
    [selectedFrameworkId, frameworks],
  );

  const enabledCount = useMemo(
    () => selectedFramework?.automationSuggestions.filter((a) => enabledAutomations.has(a.id)).length ?? 0,
    [selectedFramework, enabledAutomations],
  );

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(selectedFramework);
    if (step === 1) return businessName.trim().length > 1;
    if (step === 2) return true;
    if (step === 3) return installed;
    return true;
  }, [businessName, installed, selectedFramework, step]);

  function onSelectFramework(id: string) {
    setSelectedFrameworkId(id);
    setExpandedFramework((prev) => (prev === id ? null : id));
    const fw = frameworks.find((item) => item.id === id);
    if (fw && !businessName.trim()) {
      setBusinessName(resolveBusinessName(fw.defaultBusinessName, ""));
    }
    if (fw && !automationsInitialized) {
      const defaults = new Set(fw.automationSuggestions.filter((a) => a.defaultEnabled).map((a) => a.id));
      setEnabledAutomations(defaults);
      setAutomationsInitialized(true);
    }
  }

  function toggleAutomation(id: string) {
    setEnabledAutomations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const saveIntegration = useCallback(async (service: "resend" | "twilio") => {
    if (isDemoReadonlyClient) {
      showDemoToast();
      return;
    }

    setIntegrations((prev) => ({ ...prev, [service]: { ...prev[service], saving: true } }));

    try {
      const s = integrations[service];
      const credentials: Record<string, string> = {};

      if (service === "resend") {
        const r = s as IntegrationState["resend"];
        credentials.apiKey = r.apiKey;
        credentials.fromEmail = r.fromEmail;
        credentials.fromName = r.fromName || businessName;
      } else {
        const t = s as IntegrationState["twilio"];
        credentials.accountSid = t.accountSid;
        credentials.authToken = t.authToken;
        credentials.fromNumber = t.fromNumber;
      }

      await saveIntegrationFromWizard(service, credentials);
      setIntegrations((prev) => ({ ...prev, [service]: { ...prev[service], saving: false, connected: true } }));
    } catch {
      setIntegrations((prev) => ({ ...prev, [service]: { ...prev[service], saving: false } }));
    }
  }, [integrations, businessName, showDemoToast]);

  function goNext() {
    if (!canContinue || pending) return;
    if (step === 3 && installed) {
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
            journeyDescription,
            enabledAutomations: Array.from(enabledAutomations),
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
      description: "Your command center is ready",
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
      description: businessName || "Your page is live",
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
    <section className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-0 pb-12">
      <div className="ring-foreground/10 rounded-xl border bg-card p-5 text-card-foreground shadow-xs ring-1 sm:p-8 md:p-10">
        <div className="mb-8">
          <StepDots currentStep={step} />
        </div>

        {/* STEP 0: Choose Framework */}
        {step === 0 ? (
          <StepTransition stepKey="step-0">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Choose Your Framework</h1>
                <p className="text-sm text-muted-foreground">Pick the template closest to your business. We&apos;ll build your entire system from it.</p>
              </div>

              <div className="space-y-3">
                {frameworks.map((fw) => {
                  const active = selectedFrameworkId === fw.id;
                  const expanded = expandedFramework === fw.id;
                  const IconComponent = frameworkIcons[fw.icon] ?? Rocket;
                  return (
                    <div key={fw.id} className={`rounded-xl border transition-all ${active ? "ring-2 ring-primary border-primary/40" : ""}`}>
                      <button
                        type="button"
                        onClick={() => onSelectFramework(fw.id)}
                        className="w-full p-4 flex items-start gap-3 text-left hover:bg-accent/30 rounded-xl transition-colors"
                      >
                        <div className="size-10 rounded-lg flex items-center justify-center bg-muted shrink-0">
                          <IconComponent className="size-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm">{fw.name}</p>
                            {active ? (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-primary/10 text-primary shrink-0">Selected</span>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{fw.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {fw.pipeline.length} stages · {fw.bookingTypes.length} booking types · {fw.emailTemplates.length} emails · {fw.intakeFormFieldCount} fields
                          </p>
                        </div>
                        <div className="shrink-0 mt-1">
                          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {expanded ? (
                        <div className="px-4 pb-4 space-y-3 text-xs text-muted-foreground border-t mx-4 pt-3">
                          <div>
                            <p className="font-medium text-foreground text-xs mb-1">Pipeline</p>
                            <p>{fw.pipeline.map((s) => s.name).join(" → ")}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-xs mb-1">Booking Types</p>
                            <p>{fw.bookingTypes.map((b) => `${b.name} (${b.durationMinutes} min${b.price ? `, $${b.price}` : ", free"})`).join(" · ")}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-xs mb-1">Email Templates</p>
                            <p>{fw.emailTemplates.map((e) => e.name).join(" · ")}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-xs mb-1">Automations</p>
                            <p>{fw.automationSuggestions.map((a) => a.name.replace(/^Send |^Ask |^Follow /i, (m) => m.toLowerCase())).join(" · ")}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <p className="text-sm text-muted-foreground text-center">
                None fit?{" "}
                <Link href="/dashboard" className="text-primary underline underline-offset-4 hover:text-primary/80">
                  Start from scratch
                </Link>
              </p>
            </div>
          </StepTransition>
        ) : null}

        {/* STEP 1: Tell Us About Your Business */}
        {step === 1 ? (
          <StepTransition stepKey="step-1">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Tell Us About Your Business</h2>
                <p className="text-sm text-muted-foreground">
                  Setting up <span className="font-medium text-foreground">{selectedFramework?.name}</span>
                </p>
              </div>

              {/* Business Details Section */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Business Details</h3>
                </div>
                <div className="space-y-4 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
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

              {/* Client Journey Section */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Your Client Journey</h3>
                </div>
                <div className="p-4">
                  <div className="space-y-2">
                    <label htmlFor="setup-journey" className="text-sm font-medium text-foreground">
                      Walk me through what happens from first contact to paying client.
                    </label>
                    <p className="text-xs text-muted-foreground">2-3 sentences is perfect. This powers your automations.</p>
                    <textarea
                      id="setup-journey"
                      className={squareTextareaClass}
                      rows={3}
                      value={journeyDescription}
                      onChange={(event) => setJourneyDescription(event.target.value)}
                      placeholder="Someone fills out my form or DMs me. We do a free discovery call. If it's a fit, they sign up for a package with weekly sessions."
                    />
                  </div>
                </div>
              </div>

              {/* Automation Checkboxes Section */}
              {selectedFramework && selectedFramework.automationSuggestions.length > 0 ? (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">What should happen automatically?</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    {selectedFramework.automationSuggestions.map((automation) => {
                      const checked = enabledAutomations.has(automation.id);
                      const meta = integrationMeta[automation.requiresIntegration];
                      return (
                        <label
                          key={automation.id}
                          className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAutomation(automation.id)}
                            className="mt-0.5 size-4 rounded border-input accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{automation.name}</p>
                            {meta ? (
                              <p className="text-xs text-muted-foreground mt-0.5">via {meta.label}</p>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </StepTransition>
        ) : null}

        {/* STEP 2: Connect Your Tools */}
        {step === 2 ? (
          <StepTransition stepKey="step-2">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Connect Your Tools</h2>
                <p className="text-sm text-muted-foreground">Automations activate instantly when tools are connected.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Resend */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Resend</span>
                    <span className="text-xs text-muted-foreground">Email delivery</span>
                  </div>
                  {integrations.resend.connected ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <Check className="size-4" />
                      Connected
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        className={squareInputClass}
                        placeholder="API Key (re_...)"
                        value={integrations.resend.apiKey}
                        onChange={(e) => setIntegrations((prev) => ({ ...prev, resend: { ...prev.resend, apiKey: e.target.value } }))}
                      />
                      <input
                        className={squareInputClass}
                        placeholder="From email (hello@yourdomain.com)"
                        value={integrations.resend.fromEmail}
                        onChange={(e) => setIntegrations((prev) => ({ ...prev, resend: { ...prev.resend, fromEmail: e.target.value } }))}
                      />
                      <button
                        type="button"
                        className={`${squarePrimaryButtonClass} h-8 px-3 text-xs w-full`}
                        disabled={!integrations.resend.apiKey.trim() || !integrations.resend.fromEmail.trim() || integrations.resend.saving}
                        onClick={() => saveIntegration("resend")}
                      >
                        {integrations.resend.saving ? <Loader2 className="size-3 animate-spin" /> : "Connect"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Twilio */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Twilio</span>
                    <span className="text-xs text-muted-foreground">SMS messages</span>
                  </div>
                  {integrations.twilio.connected ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <Check className="size-4" />
                      Connected
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        className={squareInputClass}
                        placeholder="Account SID"
                        value={integrations.twilio.accountSid}
                        onChange={(e) => setIntegrations((prev) => ({ ...prev, twilio: { ...prev.twilio, accountSid: e.target.value } }))}
                      />
                      <input
                        className={squareInputClass}
                        placeholder="Auth Token"
                        type="password"
                        value={integrations.twilio.authToken}
                        onChange={(e) => setIntegrations((prev) => ({ ...prev, twilio: { ...prev.twilio, authToken: e.target.value } }))}
                      />
                      <input
                        className={squareInputClass}
                        placeholder="Phone Number (+1...)"
                        value={integrations.twilio.fromNumber}
                        onChange={(e) => setIntegrations((prev) => ({ ...prev, twilio: { ...prev.twilio, fromNumber: e.target.value } }))}
                      />
                      <button
                        type="button"
                        className={`${squarePrimaryButtonClass} h-8 px-3 text-xs w-full`}
                        disabled={!integrations.twilio.accountSid.trim() || !integrations.twilio.authToken.trim() || integrations.twilio.saving}
                        onClick={() => saveIntegration("twilio")}
                      >
                        {integrations.twilio.saving ? <Loader2 className="size-3 animate-spin" /> : "Connect"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Skip for now — you can connect these in{" "}
                <span className="text-foreground font-medium">Settings</span> anytime.
              </p>
            </div>
          </StepTransition>
        ) : null}

        {/* STEP 3: Launch / Reveal */}
        {step === 3 && !installed ? (
          <StepTransition stepKey="step-3-launch">
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Rocket className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-md">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Ready to Launch</h2>
                <p className="text-sm text-muted-foreground">
                  We&apos;ll create your pipeline, booking page, email templates, intake form, landing page, and {enabledCount} automation{enabledCount !== 1 ? "s" : ""} — all in one click.
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

        {step === 3 && installed ? (
          <StepTransition stepKey="step-3-reveal">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <Check className="h-6 w-6 text-emerald-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                  {businessName || "SeldonFrame"} is live
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

              {enabledCount > 0 ? (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2">
                  <Zap className="h-4 w-4 shrink-0" />
                  {enabledCount} automation{enabledCount !== 1 ? "s" : ""} active
                  {!integrations.resend.connected && !integrations.twilio.connected ? (
                    <span className="text-primary/70"> — connect Resend to activate email automations</span>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  Everything above is live and editable.
                </div>
              )}
            </div>
          </StepTransition>
        ) : null}

        {/* Footer Navigation */}
        <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
          <button
            type="button"
            className={`${squareOutlineButtonClass} h-9 px-4 py-2`}
            onClick={goBack}
            disabled={step === 0 || pending}
          >
            Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              className={`${squarePrimaryButtonClass} h-9 px-5 py-2`}
              onClick={goNext}
              disabled={!canContinue || pending}
            >
              Continue <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          ) : step === 3 && installed ? (
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
