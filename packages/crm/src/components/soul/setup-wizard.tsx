"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { createWorkspaceFromSetupAction } from "@/lib/billing/orgs";
import { saveIntegrationFromWizard } from "@/lib/integrations/actions";
import { generateCustomFrameworkAction, type GeneratedFrameworkPayload } from "@/lib/frameworks/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import type { FrameworkOption } from "@/app/(onboarding)/setup/page";

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Framework", "Business", "Connect", "Launch"];

const squareInputClass = "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";
const squareTextareaClass = "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none";
const squarePrimaryButtonClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground text-sm font-medium transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 outline-none";
const squareOutlineButtonClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background text-sm font-medium shadow-xs transition-all hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 outline-none";

const CONFETTI_COLORS = [
  "hsl(166 72% 40%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(217 91% 60%)",
  "hsl(280 67% 55%)",
];

function ConfettiBurst({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active || firedRef.current || !containerRef.current) return;
    firedRef.current = true;
    const container = containerRef.current;
    const count = 60;

    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      const size = Math.random() * 6 + 4;
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const angle = Math.random() * 360;
      const velocity = Math.random() * 200 + 100;
      const dx = Math.cos((angle * Math.PI) / 180) * velocity;
      const dy = Math.sin((angle * Math.PI) / 180) * velocity - 80;
      const rotation = Math.random() * 720 - 360;
      const duration = Math.random() * 800 + 1200;

      Object.assign(el.style, {
        position: "absolute",
        left: "50%",
        top: "40%",
        width: `${size}px`,
        height: `${size * (Math.random() > 0.5 ? 0.6 : 1)}px`,
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? "50%" : "1px",
        pointerEvents: "none",
        zIndex: "50",
        opacity: "1",
      });
      container.appendChild(el);

      el.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx}px,${dy + 300}px) rotate(${rotation}deg)`, opacity: 0 },
        ],
        { duration, easing: "cubic-bezier(.25,.8,.25,1)", fill: "forwards" },
      );

      setTimeout(() => el.remove(), duration + 50);
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    />
  );
}

const frameworkIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Heart,
  Building2,
  Rocket,
};

const integrationMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  resend: { label: "SeldonFrame Email", icon: Mail, description: "Built-in transactional emails" },
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
  google: { connected: boolean };
  resend: { apiKey: string; fromEmail: string; fromName: string; connected: boolean; saving: boolean };
  newsletterProvider: "kit" | "mailchimp" | "beehiiv" | null;
  kit: { apiKey: string; connected: boolean; saving: boolean };
  mailchimp: { apiKey: string; listId: string; connected: boolean; saving: boolean };
  beehiiv: { apiKey: string; publicationId: string; connected: boolean; saving: boolean };
  twilio: { accountSid: string; authToken: string; fromNumber: string; connected: boolean; saving: boolean };
};

export function SetupWizard({
  frameworks,
  createWorkspace = false,
  completionRedirect = "/welcome?fromSetup=1",
}: {
  frameworks: FrameworkOption[];
  createWorkspace?: boolean;
  completionRedirect?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showDemoToast } = useDemoToast();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  // Step 0
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>("");
  const [expandedFramework, setExpandedFramework] = useState<string | null>(null);
  const [customFrameworkPrompt, setCustomFrameworkPrompt] = useState("");
  const [customFrameworkPending, setCustomFrameworkPending] = useState(false);
  const [generatedFramework, setGeneratedFramework] = useState<GeneratedFrameworkPayload | null>(null);

  // Step 1
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [journeyDescription, setJourneyDescription] = useState("");
  const [enabledAutomations, setEnabledAutomations] = useState<Set<string>>(new Set());
  const [automationsInitialized, setAutomationsInitialized] = useState(false);

  // Step 2
  const [integrations, setIntegrations] = useState<IntegrationState>({
    google: { connected: false },
    resend: { apiKey: "", fromEmail: "", fromName: "SeldonFrame", connected: false, saving: false },
    newsletterProvider: null,
    kit: { apiKey: "", connected: false, saving: false },
    mailchimp: { apiKey: "", listId: "", connected: false, saving: false },
    beehiiv: { apiKey: "", publicationId: "", connected: false, saving: false },
    twilio: { accountSid: "", authToken: "", fromNumber: "", connected: false, saving: false },
  });

  // Step 3
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frameworkOptions = useMemo(
    () => (generatedFramework ? [...frameworks, generatedFramework.option] : frameworks),
    [frameworks, generatedFramework],
  );

  const selectedFramework = useMemo(
    () => frameworkOptions.find((fw) => fw.id === selectedFrameworkId) ?? null,
    [selectedFrameworkId, frameworkOptions],
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

  useEffect(() => {
    if (searchParams.get("calendarConnected") === "1") {
      setIntegrations((prev) => ({ ...prev, google: { connected: true } }));
    }
  }, [searchParams]);

  function onSelectFramework(id: string) {
    setSelectedFrameworkId(id);
    setExpandedFramework((prev) => (prev === id ? null : id));
    const fw = frameworkOptions.find((item) => item.id === id);
    if (fw && !businessName.trim()) {
      setBusinessName(resolveBusinessName(fw.defaultBusinessName, ""));
    }
    if (fw && !automationsInitialized) {
      const defaults = new Set(fw.automationSuggestions.filter((a) => a.defaultEnabled).map((a) => a.id));
      setEnabledAutomations(defaults);
      setAutomationsInitialized(true);
    }
  }

  async function generateCustomFramework() {
    if (customFrameworkPending || !customFrameworkPrompt.trim()) {
      return;
    }

    setCustomFrameworkPending(true);
    setError(null);

    try {
      const generated = await generateCustomFrameworkAction({
        description: customFrameworkPrompt,
        businessName,
      });

      setGeneratedFramework(generated);
      setSelectedFrameworkId(generated.option.id);
      setExpandedFramework(generated.option.id);

      if (!businessName.trim()) {
        setBusinessName(resolveBusinessName(generated.option.defaultBusinessName, ""));
      }

      if (!automationsInitialized) {
        const defaults = new Set(generated.option.automationSuggestions.filter((a) => a.defaultEnabled).map((a) => a.id));
        setEnabledAutomations(defaults);
        setAutomationsInitialized(true);
      }
    } catch {
      setError("Unable to generate custom framework. Please try again.");
    } finally {
      setCustomFrameworkPending(false);
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

  const saveIntegration = useCallback(async (service: "resend" | "kit" | "mailchimp" | "beehiiv" | "twilio") => {
    if (isDemoReadonlyClient) {
      showDemoToast();
      return;
    }

    setIntegrations((prev) => ({ ...prev, [service]: { ...prev[service], saving: true } }));

    try {
      const s = integrations[service];
      const credentials: Record<string, string> = {};

      if (service === "twilio") {
        const t = s as IntegrationState["twilio"];
        credentials.accountSid = t.accountSid;
        credentials.authToken = t.authToken;
        credentials.fromNumber = t.fromNumber;
      } else if (service === "resend") {
        const r = integrations.resend;
        credentials.apiKey = r.apiKey;
        credentials.fromEmail = r.fromEmail;
        credentials.fromName = r.fromName;
      } else if (service === "kit") {
        const n = integrations.kit;
        credentials.apiKey = n.apiKey;
      } else if (service === "mailchimp") {
        const n = integrations.mailchimp;
        credentials.apiKey = n.apiKey;
        credentials.listId = n.listId;
      } else if (service === "beehiiv") {
        const n = integrations.beehiiv;
        credentials.apiKey = n.apiKey;
        credentials.publicationId = n.publicationId;
      }

      await saveIntegrationFromWizard(service, credentials);

      if (service === "twilio") {
        setIntegrations((prev) => ({ ...prev, twilio: { ...prev.twilio, saving: false, connected: true } }));
      } else if (service === "resend") {
        setIntegrations((prev) => ({ ...prev, resend: { ...prev.resend, saving: false, connected: true } }));
      } else {
        setIntegrations((prev) => ({
          ...prev,
          newsletterProvider: service,
          kit: { ...prev.kit, saving: false, connected: service === "kit" },
          mailchimp: { ...prev.mailchimp, saving: false, connected: service === "mailchimp" },
          beehiiv: { ...prev.beehiiv, saving: false, connected: service === "beehiiv" },
        }));
      }
    } catch {
      if (service === "twilio") {
        setIntegrations((prev) => ({ ...prev, twilio: { ...prev.twilio, saving: false } }));
      } else if (service === "resend") {
        setIntegrations((prev) => ({ ...prev, resend: { ...prev.resend, saving: false } }));
      } else if (service === "kit") {
        setIntegrations((prev) => ({ ...prev, kit: { ...prev.kit, saving: false } }));
      } else if (service === "mailchimp") {
        setIntegrations((prev) => ({ ...prev, mailchimp: { ...prev.mailchimp, saving: false } }));
      } else {
        setIntegrations((prev) => ({ ...prev, beehiiv: { ...prev.beehiiv, saving: false } }));
      }
    }
  }, [integrations, showDemoToast]);

  function goNext() {
    if (!canContinue || pending) return;
    if (step === 3 && installed) {
      router.push(completionRedirect);
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

        if (createWorkspace) {
          await createWorkspaceFromSetupAction({
            businessName,
            frameworkId: selectedFramework!.id,
            generatedFramework: generatedFramework && selectedFramework!.id === generatedFramework.option.id ? generatedFramework.framework : null,
            location,
            websiteUrl,
            journeyDescription,
            enabledAutomations: Array.from(enabledAutomations),
          });
        } else {
          await installSoul({
            frameworkId: selectedFramework!.id,
            framework: generatedFramework && selectedFramework!.id === generatedFramework.option.id ? generatedFramework.framework : undefined,
            answers: {
              ownerName,
              ownerFullName: ownerName,
              businessName,
              location,
              websiteUrl,
              journeyDescription,
              enabledAutomations: Array.from(enabledAutomations),
            },
            markCompleted: true,
          });
        }

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
                {frameworkOptions.map((fw) => {
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
                          {fw.readme ? (
                            <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3">
                              <p className="font-medium text-foreground text-xs">Why this framework works</p>
                              <p>{fw.readme.overview}</p>
                              <p><span className="font-medium text-foreground">Pipeline:</span> {fw.readme.whyThisPipeline}</p>
                              <p><span className="font-medium text-foreground">Emails:</span> {fw.readme.whyTheseEmails}</p>
                              <p><span className="font-medium text-foreground">Bookings:</span> {fw.readme.whyTheseBookings}</p>
                              <p><span className="font-medium text-foreground">Automations:</span> {fw.readme.whyTheseAutomations}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <div className={`rounded-xl border transition-all ${selectedFrameworkId.startsWith("custom-") ? "ring-2 ring-primary border-primary/40" : ""}`}>
                  <div className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="size-10 rounded-lg flex items-center justify-center bg-muted shrink-0">
                        <Sparkles className="size-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">Custom (Generate with Seldon)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Describe your business and Seldon will generate a custom CRM framework.</p>
                      </div>
                    </div>

                    <textarea
                      className={squareTextareaClass}
                      rows={3}
                      value={customFrameworkPrompt}
                      onChange={(event) => setCustomFrameworkPrompt(event.target.value)}
                      placeholder="I run a boutique recruiting firm for healthcare leadership. We qualify candidates, run interview sprints, and place retained executive searches."
                    />

                    <button
                      type="button"
                      onClick={generateCustomFramework}
                      disabled={customFrameworkPending || !customFrameworkPrompt.trim()}
                      className={`${squarePrimaryButtonClass} h-9 px-4 py-2`}
                    >
                      {customFrameworkPending ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" /> Generating...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Sparkles className="size-4" /> Generate Custom Framework
                        </span>
                      )}
                    </button>
                  </div>
                </div>
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

                  <div className="space-y-2">
                    <label htmlFor="setup-website" className="text-sm font-medium text-foreground">
                      Website URL <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <input
                      id="setup-website"
                      className={squareInputClass}
                      value={websiteUrl}
                      onChange={(event) => setWebsiteUrl(event.target.value)}
                      placeholder="https://yourwebsite.com"
                    />
                    <p className="text-xs text-muted-foreground">If provided, Seldon will ingest this site into Soul Knowledge during setup.</p>
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

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Resend Email</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Send transactional emails</p>
                  <input
                    className={squareInputClass}
                    placeholder="Resend API key"
                    type="password"
                    value={integrations.resend.apiKey}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, resend: { ...prev.resend, apiKey: e.target.value } }))}
                  />
                  <input
                    className={squareInputClass}
                    placeholder="From email (optional)"
                    value={integrations.resend.fromEmail}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, resend: { ...prev.resend, fromEmail: e.target.value } }))}
                  />
                  <button
                    type="button"
                    className={`${squarePrimaryButtonClass} h-8 px-3 text-xs w-full`}
                    disabled={!integrations.resend.apiKey.trim() || integrations.resend.saving}
                    onClick={() => saveIntegration("resend")}
                  >
                    {integrations.resend.connected ? "✓ Connected" : integrations.resend.saving ? <Loader2 className="size-3 animate-spin" /> : "Connect"}
                  </button>
                </div>

                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Google Calendar</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Sync your availability</p>
                  <Link
                    href="/api/integrations/google-calendar?returnTo=%2Fsetup"
                    prefetch={false}
                    className={`${integrations.google.connected ? squareOutlineButtonClass : squarePrimaryButtonClass} h-8 px-3 text-xs w-full`}
                  >
                    {integrations.google.connected ? "✓ Connected" : "Connect OAuth"}
                  </Link>
                </div>

                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Stripe</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Accept payments</p>
                  <Link href="/settings/integrations" className={`${squareOutlineButtonClass} h-8 px-3 text-xs w-full`}>
                    Connect in Settings
                  </Link>
                </div>

                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Kit Newsletter</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Sync new contacts to your list</p>
                  <input
                    className={squareInputClass}
                    placeholder="API key"
                    value={integrations.kit.apiKey}
                    disabled={Boolean(integrations.newsletterProvider && integrations.newsletterProvider !== "kit")}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, kit: { ...prev.kit, apiKey: e.target.value } }))}
                  />
                  <button
                    type="button"
                    className={`${squarePrimaryButtonClass} h-8 px-3 text-xs w-full`}
                    disabled={
                      !integrations.kit.apiKey.trim() ||
                      integrations.kit.saving ||
                      Boolean(integrations.newsletterProvider && integrations.newsletterProvider !== "kit")
                    }
                    onClick={() => saveIntegration("kit")}
                  >
                    {integrations.kit.saving ? <Loader2 className="size-3 animate-spin" /> : "Connect"}
                  </button>
                </div>

                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Mailchimp</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Sync new contacts to your list</p>
                  <input
                    className={squareInputClass}
                    placeholder="API key"
                    value={integrations.mailchimp.apiKey}
                    disabled={Boolean(integrations.newsletterProvider && integrations.newsletterProvider !== "mailchimp")}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, mailchimp: { ...prev.mailchimp, apiKey: e.target.value } }))}
                  />
                  <input
                    className={squareInputClass}
                    placeholder="List ID"
                    value={integrations.mailchimp.listId}
                    disabled={Boolean(integrations.newsletterProvider && integrations.newsletterProvider !== "mailchimp")}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, mailchimp: { ...prev.mailchimp, listId: e.target.value } }))}
                  />
                  <button
                    type="button"
                    className={`${squarePrimaryButtonClass} h-8 px-3 text-xs w-full`}
                    disabled={
                      !integrations.mailchimp.apiKey.trim() ||
                      integrations.mailchimp.saving ||
                      Boolean(integrations.newsletterProvider && integrations.newsletterProvider !== "mailchimp")
                    }
                    onClick={() => saveIntegration("mailchimp")}
                  >
                    {integrations.mailchimp.saving ? <Loader2 className="size-3 animate-spin" /> : "Connect"}
                  </button>
                </div>

                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Beehiiv</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Sync new contacts to your list</p>
                  <input
                    className={squareInputClass}
                    placeholder="API key"
                    value={integrations.beehiiv.apiKey}
                    disabled={Boolean(integrations.newsletterProvider && integrations.newsletterProvider !== "beehiiv")}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, beehiiv: { ...prev.beehiiv, apiKey: e.target.value } }))}
                  />
                  <input
                    className={squareInputClass}
                    placeholder="Publication ID (optional)"
                    value={integrations.beehiiv.publicationId}
                    disabled={Boolean(integrations.newsletterProvider && integrations.newsletterProvider !== "beehiiv")}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, beehiiv: { ...prev.beehiiv, publicationId: e.target.value } }))}
                  />
                  <button
                    type="button"
                    className={`${squarePrimaryButtonClass} h-8 px-3 text-xs w-full`}
                    disabled={
                      !integrations.beehiiv.apiKey.trim() ||
                      integrations.beehiiv.saving ||
                      Boolean(integrations.newsletterProvider && integrations.newsletterProvider !== "beehiiv")
                    }
                    onClick={() => saveIntegration("beehiiv")}
                  >
                    {integrations.beehiiv.saving ? <Loader2 className="size-3 animate-spin" /> : "Connect"}
                  </button>
                </div>

                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Twilio SMS</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Send text reminders</p>
                  <input
                    className={squareInputClass}
                    placeholder="Account SID"
                    value={integrations.twilio.accountSid}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, twilio: { ...prev.twilio, accountSid: e.target.value } }))}
                  />
                  <input
                    className={squareInputClass}
                    placeholder="Auth token"
                    type="password"
                    value={integrations.twilio.authToken}
                    onChange={(e) => setIntegrations((prev) => ({ ...prev, twilio: { ...prev.twilio, authToken: e.target.value } }))}
                  />
                  <input
                    className={squareInputClass}
                    placeholder="Phone number (+1...)"
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
              </div>

              {integrations.newsletterProvider ? (
                <p className="text-xs text-center text-muted-foreground">
                  You&apos;re already connected to {integrations.newsletterProvider}. To switch, disconnect in Settings.
                </p>
              ) : null}

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
                className={`${squarePrimaryButtonClass} relative h-12 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90`}
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
              {error ? <p className="text-sm text-negative">{error}</p> : null}
            </div>
          </StepTransition>
        ) : null}

        {step === 3 && installed ? (
          <StepTransition stepKey="step-3-reveal">
            <div className="relative space-y-6">
              <ConfettiBurst active={installed} />
              <div className="space-y-2 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-positive/10">
                  <Check className="h-6 w-6 text-positive" />
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
                        <p className="text-base sm:text-lg font-semibold leading-tight tracking-tight text-positive">Live</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1">{card.description}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {selectedFramework?.seldonExamples?.length ? (
                <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
                  <div className="text-left space-y-1">
                    <p className="text-base sm:text-lg font-semibold text-foreground">✨ Make a block yours</p>
                    <p className="text-sm text-muted-foreground">
                      Every business is different. Pick any block and tell Seldon how yours should work. Takes 10 seconds.
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedFramework.seldonExamples.slice(0, 5).map((example) => (
                      <Link
                        key={`${example.block}-${example.label}`}
                        href={`/seldon?prompt=${encodeURIComponent(example.prompt)}`}
                        className="rounded-lg border border-border p-3 text-left hover:bg-accent/30 transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground">
                          <span className="mr-1.5" aria-hidden="true">{example.icon}</span>
                          {example.label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">&quot;{example.description}&quot;</p>
                      </Link>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p className="text-muted-foreground">Click any to customize — or skip and do it from your dashboard anytime.</p>
                    <Link href={completionRedirect} className="text-primary hover:underline">
                      Skip — go to Dashboard →
                    </Link>
                  </div>
                </div>
              ) : null}

              {enabledCount > 0 ? (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2">
                  <Zap className="h-4 w-4 shrink-0" />
                  {enabledCount} automation{enabledCount !== 1 ? "s" : ""} active
                  {!integrations.newsletterProvider && !integrations.twilio.connected ? (
                    <span className="text-primary/70"> — connect a newsletter or SMS provider to activate delivery automations</span>
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
              onClick={() => router.push(completionRedirect)}
            >
              Continue <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
