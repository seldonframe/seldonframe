"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { generateSoulPreviewAction, saveSoulAction } from "@/lib/soul/actions";
import type { OrgSoul, SoulWizardInput } from "@/lib/soul/types";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

const initialInput: SoulWizardInput = {
  businessName: "",
  offerType: "services",
  businessDescription: "",
  industry: "coaching",
  clientType: "B2C",
  clientLabel: "Client",
  leadSources: [],
  processDescription: "",
  processDuration: "",
  stages: ["Inquiry", "Discovery Call", "Proposal", "Won"],
  communicationStyle: "friendly",
  vocabulary: [],
  avoidWords: [],
  priorities: ["new clients"],
  painPoint: "",
  clientDescription: "",
};

const stepCount = 8;

const industries = [
  { value: "coaching", icon: "🎯", title: "Coaching", subtitle: "Life, executive, business" },
  { value: "consulting", icon: "💼", title: "Consulting", subtitle: "Management, strategy, IT" },
  { value: "agency", icon: "🏢", title: "Agency", subtitle: "Marketing, design, development" },
  { value: "real-estate", icon: "🏠", title: "Real Estate", subtitle: "Buying, selling, property management" },
  { value: "therapy", icon: "🧠", title: "Therapy / Counseling", subtitle: "Clinical and private practice" },
  { value: "financial-advisory", icon: "💰", title: "Financial Advisory", subtitle: "Planning and wealth guidance" },
  { value: "legal-services", icon: "⚖️", title: "Legal Services", subtitle: "Cases, retainers, outcomes" },
  { value: "education", icon: "📚", title: "Education / Tutoring", subtitle: "Students, cohorts, programs" },
  { value: "professional-services", icon: "🔧", title: "Professional Services", subtitle: "Specialized expertise" },
  { value: "custom", icon: "✏️", title: "Custom", subtitle: "Type your own" },
] as const;

const clientLabels = ["Clients", "Patients", "Students", "Customers", "Members", "Accounts", "Custom"] as const;

const toneOptions = [
  {
    value: "professional",
    icon: "📋",
    title: "Professional",
    subtitle: "Clear, structured, and polished",
    preview: "Dear Sarah, I wanted to follow up on our discussion...",
  },
  {
    value: "friendly",
    icon: "😊",
    title: "Friendly",
    subtitle: "Warm, approachable, and personable",
    preview: "Hey Sarah! Great chatting with you yesterday...",
  },
  {
    value: "direct",
    icon: "🎯",
    title: "Direct",
    subtitle: "Concise, action-oriented, no fluff",
    preview: "Sarah — quick follow-up on our call. Next steps below.",
  },
  {
    value: "casual",
    icon: "💬",
    title: "Casual",
    subtitle: "Conversational, relaxed, authentic",
    preview: "Sarah! So good to connect. Here's what I'm thinking...",
  },
] as const;

const priorityOptions = [
  {
    value: "new clients",
    icon: "🎯",
    title: "Getting new clients",
    subtitle: "Optimize for lead capture, outreach, and conversion",
  },
  {
    value: "schedule",
    icon: "📅",
    title: "Managing your schedule",
    subtitle: "Optimize for bookings, reminders, and calendar",
  },
  {
    value: "relationships",
    icon: "💬",
    title: "Client relationships",
    subtitle: "Optimize for communication, portal, and retention",
  },
  {
    value: "revenue",
    icon: "📊",
    title: "Tracking revenue",
    subtitle: "Optimize for payments, invoicing, and overview",
  },
] as const;

const defaultStagesByIndustry: Record<string, string[]> = {
  coaching: ["Inquiry", "Discovery Call", "Proposal", "Won"],
  consulting: ["Lead", "Qualification", "Scope", "Signed"],
  agency: ["Lead", "Brief", "Pitch", "Retainer"],
  "real-estate": ["Inquiry", "Tour", "Offer", "Closed"],
  therapy: ["Inquiry", "Consultation", "Care Plan", "Ongoing"],
  "financial-advisory": ["Inquiry", "Audit", "Plan", "Client"],
  "legal-services": ["Intake", "Review", "Engagement", "Active"],
  education: ["Inquiry", "Assessment", "Enrollment", "Active"],
  "professional-services": ["Inquiry", "Discovery", "Proposal", "Won"],
};

function normalizeLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Client";
  }

  const singular = trimmed.endsWith("s") ? trimmed.slice(0, -1) : trimmed;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

function parseCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPlural(value: string) {
  if (value.endsWith("s")) {
    return value;
  }

  return `${value}s`;
}

function BusinessNameStep({ businessName, onChange }: { businessName: string; onChange: (value: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/15 bg-slate-900/70 p-6 shadow-xl shadow-black/30 md:p-10">
      <h1 className="text-center text-3xl font-semibold text-foreground">What&apos;s your business called?</h1>
      <input
        autoFocus
        className="mt-8 h-14 w-full rounded-xl border border-white/20 bg-slate-950/70 px-5 text-center text-xl text-foreground outline-none transition focus:border-teal-300"
        value={businessName}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Your business name"
      />
      <p className="mt-4 text-center text-sm text-slate-300">This appears on your booking page, emails, and client portal.</p>

      <div className="mt-8 rounded-xl border border-white/10 bg-slate-950/80 p-4">
        <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Live preview</p>
        <p className="mt-2 text-lg font-semibold text-foreground">{businessName || "Your Business"}</p>
        <p className="mt-1 text-sm text-slate-300">Dashboard • Bookings • Inbox</p>
      </div>
    </div>
  );
}

type IndustryStepProps = {
  selectedIndustry: string;
  customIndustry: string;
  industryFeedback: string | null;
  onIndustrySelect: (industry: string) => void;
  onCustomIndustryChange: (value: string) => void;
};

function IndustryStep({ selectedIndustry, customIndustry, industryFeedback, onIndustrySelect, onCustomIndustryChange }: IndustryStepProps) {
  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/15 bg-slate-900/70 p-6 shadow-xl shadow-black/30 md:p-8">
      <h2 className="text-center text-3xl font-semibold text-foreground">What best describes your practice?</h2>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {industries.map((industry) => {
          const active = selectedIndustry === industry.value;

          return (
            <button
              key={industry.value}
              type="button"
              onClick={() => onIndustrySelect(industry.value)}
              className={`rounded-xl border p-4 text-left transition ${
                active ? "border-teal-300 bg-teal-500/10" : "border-white/10 bg-slate-950/70 hover:border-white/30"
              }`}
            >
              <p className="text-lg">{industry.icon}</p>
              <p className="mt-2 font-medium text-foreground">{industry.title}</p>
              <p className="text-sm text-slate-300">{industry.subtitle}</p>
            </button>
          );
        })}
      </div>

      {selectedIndustry === "custom" ? (
        <input
          className="mt-4 h-12 w-full rounded-xl border border-white/20 bg-slate-950/70 px-4 text-foreground outline-none focus:border-teal-300"
          value={customIndustry}
          onChange={(event) => onCustomIndustryChange(event.target.value)}
          placeholder="Describe your practice"
        />
      ) : null}

      {industryFeedback ? (
        <div className="mt-4 rounded-xl border border-teal-300/30 bg-teal-500/10 p-3 text-sm text-teal-100">
          <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-teal-300" />
          </div>
          {industryFeedback}
        </div>
      ) : null}
    </div>
  );
}

function DescriptionStep({ description, onChange }: { description: string; onChange: (value: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/15 bg-slate-900/70 p-6 shadow-xl shadow-black/30 md:p-10">
      <h2 className="text-center text-3xl font-semibold text-foreground">In one or two sentences, what do you help people with?</h2>
      <textarea
        autoFocus
        className="mt-6 min-h-32 w-full rounded-xl border border-white/20 bg-slate-950/70 p-4 text-foreground outline-none focus:border-teal-300"
        value={description}
        maxLength={280}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g., I help executives develop leadership skills and build high-performing teams"
      />
      <div className="mt-2 flex items-center justify-between text-sm text-slate-300">
        <p>The AI will use this to personalize your pages, emails, and client communication.</p>
        <p>{description.length}/280</p>
      </div>
    </div>
  );
}

type ClientsStepProps = {
  clientLabel: string;
  customClientLabel: string;
  clientDescription: string;
  contactPlural: string;
  onClientLabelSelect: (label: string) => void;
  onCustomClientLabelChange: (value: string) => void;
  onClientDescriptionChange: (value: string) => void;
};

function ClientsStep({
  clientLabel,
  customClientLabel,
  clientDescription,
  contactPlural,
  onClientLabelSelect,
  onCustomClientLabelChange,
  onClientDescriptionChange,
}: ClientsStepProps) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 rounded-2xl border border-white/15 bg-slate-900/70 p-6 shadow-xl shadow-black/30 md:grid-cols-[1.1fr,0.9fr] md:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-foreground">Who are your clients?</h2>

        <p className="mt-6 text-sm font-medium text-slate-200">What do you call the people you work with?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {clientLabels.map((label) => {
            const active = (label === "Custom" && !clientLabels.includes(clientLabel as (typeof clientLabels)[number])) || clientLabel === normalizeLabel(label);

            return (
              <button
                key={label}
                type="button"
                onClick={() => onClientLabelSelect(label)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  active ? "border-teal-300 bg-teal-500/15 text-foreground" : "border-white/20 text-slate-200 hover:border-white/40"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <input
          className="mt-3 h-11 w-full rounded-xl border border-white/20 bg-slate-950/70 px-4 text-foreground outline-none focus:border-teal-300"
          value={customClientLabel}
          onChange={(event) => onCustomClientLabelChange(event.target.value)}
          placeholder="Custom label (optional)"
        />

        <p className="mt-6 text-sm font-medium text-slate-200">Who&apos;s your ideal client?</p>
        <textarea
          className="mt-3 min-h-28 w-full rounded-xl border border-white/20 bg-slate-950/70 p-4 text-foreground outline-none focus:border-teal-300"
          value={clientDescription}
          onChange={(event) => onClientDescriptionChange(event.target.value)}
          placeholder="e.g., Coaches earning between $5,000 and $25,000 per month who want to scale using social media"
        />
      </div>

      <aside className="rounded-xl border border-white/15 bg-slate-950/80 p-4">
        <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Mini CRM preview</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-200">
          <li className="rounded-lg bg-slate-900 px-3 py-2 text-foreground">{contactPlural}</li>
          <li className="rounded-lg bg-slate-900 px-3 py-2">Pipeline</li>
          <li className="rounded-lg bg-slate-900 px-3 py-2">Bookings</li>
          <li className="rounded-lg bg-slate-900 px-3 py-2">Inbox</li>
        </ul>
      </aside>
    </div>
  );
}

type ProcessStepProps = {
  stages: string[];
  processDescription: string;
  draggedStageIndex: number | null;
  onDragStart: (index: number) => void;
  onDropAt: (index: number) => void;
  onDragEnd: () => void;
  onStageChange: (index: number, value: string) => void;
  onRemoveStage: (index: number) => void;
  onAddStage: () => void;
  onProcessDescriptionChange: (value: string) => void;
};

function ProcessStep({
  stages,
  processDescription,
  draggedStageIndex,
  onDragStart,
  onDropAt,
  onDragEnd,
  onStageChange,
  onRemoveStage,
  onAddStage,
  onProcessDescriptionChange,
}: ProcessStepProps) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 rounded-2xl border border-white/15 bg-slate-900/70 p-6 shadow-xl shadow-black/30 md:grid-cols-[1.1fr,0.9fr] md:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-foreground">How do clients move through your business?</h2>
        <div className="mt-6 overflow-x-auto pb-1">
          <div className="flex min-w-max items-center gap-2">
            {stages.map((stage, index) => (
              <div key={`${stage}-${index}`} className="flex items-center gap-2">
                <div
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedStageIndex !== null) {
                      onDropAt(index);
                    }
                  }}
                  onDragEnd={onDragEnd}
                  className="flex cursor-grab items-center gap-2 rounded-full border border-teal-200/40 bg-teal-500/20 px-3 py-2 active:cursor-grabbing"
                >
                  <input
                    className="w-28 bg-transparent text-sm text-foreground outline-none"
                    value={stage}
                    onChange={(event) => onStageChange(index, event.target.value)}
                  />
                  <button type="button" className="text-xs text-slate-200" onClick={() => onRemoveStage(index)}>
                    ✕
                  </button>
                </div>
                {index < stages.length - 1 ? <span className="h-px w-6 bg-teal-200/40" /> : null}
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-foreground" onClick={onAddStage}>
          + Add stage
        </button>

        <p className="mt-6 text-sm text-slate-300">Or describe your process and we&apos;ll build it for you.</p>
        <textarea
          className="mt-3 min-h-28 w-full rounded-xl border border-white/20 bg-slate-950/70 p-4 text-foreground outline-none focus:border-teal-300"
          value={processDescription}
          onChange={(event) => onProcessDescriptionChange(event.target.value)}
          placeholder="Inquiry -> Discovery call -> Proposal -> Won"
        />
      </div>

      <aside className="rounded-xl border border-white/15 bg-slate-950/80 p-4">
        <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Pipeline preview</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {stages.map((stage, index) => (
            <motion.div key={`${stage}-${index}`} layout className="rounded-lg border border-white/10 bg-slate-900 p-3">
              <p className="text-sm font-medium text-foreground">{stage}</p>
              <p className="mt-1 text-xs text-slate-400">0 items</p>
            </motion.div>
          ))}
        </div>
      </aside>
    </div>
  );
}

type VoiceStepProps = {
  communicationStyle: string;
  showVoiceDetails: boolean;
  vocabulary: string[];
  avoidWords: string[];
  onToneSelect: (value: string) => void;
  onToggleVoiceDetails: () => void;
  onVocabularyChange: (value: string) => void;
  onAvoidWordsChange: (value: string) => void;
};

function VoiceStep({
  communicationStyle,
  showVoiceDetails,
  vocabulary,
  avoidWords,
  onToneSelect,
  onToggleVoiceDetails,
  onVocabularyChange,
  onAvoidWordsChange,
}: VoiceStepProps) {
  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-white/15 bg-slate-900/70 p-6 shadow-xl shadow-black/30 md:p-8">
      <h2 className="text-3xl font-semibold text-foreground">Pick the tone that sounds most like you</h2>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {toneOptions.map((tone) => {
          const active = communicationStyle === tone.value;

          return (
            <button
              key={tone.value}
              type="button"
              onClick={() => onToneSelect(tone.value)}
              className={`rounded-xl border p-4 text-left transition ${
                active ? "border-teal-300 bg-teal-500/10" : "border-white/10 bg-slate-950/70 hover:border-white/30"
              }`}
            >
              <p className="text-lg">{tone.icon}</p>
              <p className="mt-2 font-medium text-foreground">{tone.title}</p>
              <p className="text-sm text-slate-300">{tone.subtitle}</p>
              <p className="mt-3 rounded-lg border border-white/10 bg-slate-900 p-3 text-sm text-slate-200">{tone.preview}</p>
            </button>
          );
        })}
      </div>

      <button type="button" className="mt-4 text-sm text-teal-200 underline underline-offset-4" onClick={onToggleVoiceDetails}>
        Fine-tune your voice
      </button>

      {showVoiceDetails ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            className="h-11 rounded-xl border border-white/20 bg-slate-950/70 px-4 text-foreground outline-none focus:border-teal-300"
            value={vocabulary.join(", ")}
            onChange={(event) => onVocabularyChange(event.target.value)}
            placeholder="Words you like to use"
          />
          <input
            className="h-11 rounded-xl border border-white/20 bg-slate-950/70 px-4 text-foreground outline-none focus:border-teal-300"
            value={avoidWords.join(", ")}
            onChange={(event) => onAvoidWordsChange(event.target.value)}
            placeholder="Words to avoid"
          />
        </div>
      ) : null}
    </div>
  );
}

function PrioritiesStep({ priorities, onTogglePriority }: { priorities: string[]; onTogglePriority: (value: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-white/15 bg-slate-900/70 p-6 shadow-xl shadow-black/30 md:p-8">
      <h2 className="text-3xl font-semibold text-foreground">What should your dashboard focus on first?</h2>
      <p className="mt-2 text-sm text-slate-300">Pick up to three priorities.</p>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {priorityOptions.map((priority) => {
          const active = priorities.includes(priority.value);

          return (
            <button
              key={priority.value}
              type="button"
              onClick={() => onTogglePriority(priority.value)}
              className={`rounded-xl border p-4 text-left transition ${
                active ? "border-teal-300 bg-teal-500/10" : "border-white/10 bg-slate-950/70 hover:border-white/30"
              }`}
            >
              <p className="text-lg">{priority.icon}</p>
              <p className="mt-2 font-medium text-foreground">{priority.title}</p>
              <p className="text-sm text-slate-300">{priority.subtitle}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type RevealStepProps = {
  businessName: string;
  contactPlural: string;
  stages: string[];
  industry: string;
  communicationStyle: string;
  priorities: string[];
  previewSoul: OrgSoul | null;
  error: string | null;
};

function RevealStep({ businessName, contactPlural, stages, industry, communicationStyle, priorities, previewSoul, error }: RevealStepProps) {
  return (
    <div className="w-full px-2 md:px-0">
      <h2 className="text-center text-3xl font-semibold text-foreground md:text-left">Here&apos;s your system</h2>

      <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-slate-950/80 p-4 md:hidden">
        <aside className="rounded-xl border border-white/10 bg-slate-900 p-4">
          <p className="text-sm font-semibold text-foreground">{businessName || "Your Business"}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            <li>{contactPlural}</li>
            <li>Pipeline</li>
            <li>Bookings</li>
          </ul>
        </aside>

        <div className="rounded-xl border border-white/10 bg-slate-900 p-4">
          <p className="text-sm font-medium text-foreground">Pipeline stages</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {stages.map((stage) => (
              <span key={stage} className="rounded-full border border-teal-200/40 bg-teal-500/20 px-3 py-1 text-xs text-foreground">
                {stage}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 hidden gap-4 rounded-2xl border border-white/10 bg-slate-950/80 p-5 md:grid md:grid-cols-[0.28fr,0.72fr]">
        <aside className="rounded-xl border border-white/10 bg-slate-900 p-4">
          <p className="text-sm font-semibold text-foreground">{businessName || "Your Business"}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            <li>{contactPlural}</li>
            <li>Pipeline</li>
            <li>Bookings</li>
            <li>Inbox</li>
          </ul>
        </aside>

        <div className="grid gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-900 p-4">
            <p className="text-sm text-slate-300">Good morning</p>
            <p className="text-xl font-semibold text-foreground">{businessName || "Founder"}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900 p-4">
            <p className="text-sm font-medium text-foreground">Pipeline preview</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {stages.map((stage) => (
                <span key={stage} className="rounded-full border border-teal-200/40 bg-teal-500/20 px-3 py-1 text-xs text-foreground">
                  {stage}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-200">
        <p>Your {industry || "business"} system is configured with:</p>
        <ul className="mt-3 space-y-2">
          <li>✓ {contactPlural} management with {stages.length} pipeline stages</li>
          <li>✓ Booking page ready to share</li>
          <li>✓ Email in {communicationStyle} voice</li>
          <li>✓ Dashboard focused on {priorities.join(", ")}</li>
        </ul>
        {previewSoul ? <p className="mt-3 text-xs text-teal-200">AI preview generated and ready to launch.</p> : null}
        <p className="mt-2 text-xs text-slate-400">You can change everything later in Settings.</p>
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}

export function SoulWizard({ completionRedirect = "/dashboard" }: { completionRedirect?: string }) {
  const router = useRouter();
  const { showDemoToast } = useDemoToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState<SoulWizardInput>(initialInput);
  const [previewSoul, setPreviewSoul] = useState<OrgSoul | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [customIndustry, setCustomIndustry] = useState("");
  const [customClientLabel, setCustomClientLabel] = useState("");
  const [showVoiceDetails, setShowVoiceDetails] = useState(false);
  const [industryFeedback, setIndustryFeedback] = useState<string | null>(null);
  const [draggedStageIndex, setDraggedStageIndex] = useState<number | null>(null);

  const progressPercent = ((stepIndex + 1) / stepCount) * 100;

  const contactSingular = useMemo(() => normalizeLabel(input.clientLabel), [input.clientLabel]);
  const contactPlural = useMemo(() => getPlural(contactSingular), [contactSingular]);

  const canContinue = useMemo(() => {
    if (stepIndex === 0) {
      return input.businessName.trim().length > 0;
    }

    if (stepIndex === 1) {
      if (input.industry === "custom") {
        return customIndustry.trim().length > 1;
      }

      return input.industry.trim().length > 0;
    }

    if (stepIndex === 2) {
      return input.businessDescription.trim().length > 0;
    }

    if (stepIndex === 3) {
      return input.clientDescription.trim().length > 0;
    }

    if (stepIndex === 4) {
      return input.stages.length > 0 || input.processDescription.trim().length > 0;
    }

    if (stepIndex === 5) {
      return input.communicationStyle.trim().length > 0;
    }

    if (stepIndex === 6) {
      return input.priorities.length > 0;
    }

    return true;
  }, [customIndustry, input, stepIndex]);

  const onIndustrySelect = (industry: string) => {
    setInput((current) => ({
      ...current,
      industry,
      stages: defaultStagesByIndustry[industry] ?? current.stages,
    }));
    setIndustryFeedback(`Your ${industry.replace("-", " ")} system is taking shape`);
  };

  useEffect(() => {
    if (!industryFeedback) {
      return;
    }

    const timeout = window.setTimeout(() => setIndustryFeedback(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [industryFeedback]);

  const onClientLabelSelect = (label: string) => {
    if (label === "Custom") {
      setInput((current) => ({ ...current, clientLabel: customClientLabel || "Client" }));
      return;
    }

    setInput((current) => ({ ...current, clientLabel: normalizeLabel(label) }));
  };

  const addStage = () => {
    setInput((current) => ({
      ...current,
      stages: [...current.stages, `Stage ${current.stages.length + 1}`],
    }));
  };

  const removeStage = (index: number) => {
    setInput((current) => ({
      ...current,
      stages: current.stages.filter((_, stageIndex) => stageIndex !== index),
    }));
  };

  const updateStage = (index: number, value: string) => {
    setInput((current) => ({
      ...current,
      stages: current.stages.map((stage, stageIndex) => (stageIndex === index ? value : stage)),
    }));
  };

  const moveStage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= input.stages.length) {
      return;
    }

    setInput((current) => {
      const nextStages = [...current.stages];
      const [moved] = nextStages.splice(fromIndex, 1);
      nextStages.splice(toIndex, 0, moved);
      return { ...current, stages: nextStages };
    });
  };

  const updateProcessDescription = (value: string) => {
    const parsedStages = value
      .split(/\n|->|→|,|>/)
      .map((stage) => stage.trim())
      .filter(Boolean);

    setInput((current) => ({
      ...current,
      processDescription: value,
      stages: parsedStages.length >= 2 ? parsedStages.slice(0, 8) : current.stages,
    }));
  };

  const togglePriority = (value: string) => {
    setInput((current) => {
      const selected = current.priorities.includes(value);

      if (selected) {
        return { ...current, priorities: current.priorities.filter((priority) => priority !== value) };
      }

      if (current.priorities.length >= 3) {
        return current;
      }

      return { ...current, priorities: [...current.priorities, value] };
    });
  };

  const goNext = () => {
    if (stepIndex === 6) {
      startTransition(async () => {
        const generated = await generateSoulPreviewAction(input);
        setPreviewSoul(generated);
        setStepIndex((idx) => Math.min(idx + 1, stepCount - 1));
      });
      return;
    }

    setStepIndex((idx) => Math.min(idx + 1, stepCount - 1));
  };

  const goBack = () => setStepIndex((idx) => Math.max(0, idx - 1));

  const save = () => {
    if (!previewSoul) {
      return;
    }

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await saveSoulAction(previewSoul);
        router.push(completionRedirect);
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        setError("Failed to save setup. Please try again.");
      }
    });
  };

  return (
    <section className="relative mx-auto w-full max-w-6xl px-4 py-8">
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-70"
        style={{
          background:
            stepIndex < 3
              ? "radial-gradient(circle at 12% 12%, rgba(20, 184, 166, 0.22), transparent 42%), radial-gradient(circle at 82% 0%, rgba(245, 158, 11, 0.17), transparent 46%), linear-gradient(120deg, rgba(15,23,42,0.93), rgba(17,24,39,0.95))"
              : stepIndex < 6
                ? "radial-gradient(circle at 8% 8%, rgba(16, 185, 129, 0.19), transparent 44%), radial-gradient(circle at 88% 24%, rgba(14, 165, 233, 0.14), transparent 45%), linear-gradient(120deg, rgba(15,23,42,0.93), rgba(22,28,45,0.95))"
                : "radial-gradient(circle at 14% 18%, rgba(45, 212, 191, 0.24), transparent 42%), radial-gradient(circle at 86% 16%, rgba(56, 189, 248, 0.15), transparent 46%), linear-gradient(120deg, rgba(8,47,73,0.95), rgba(15,23,42,0.95))",
        }}
      />

      <div className={`relative z-10 mx-auto w-full ${stepIndex === 7 ? "max-w-6xl" : "max-w-4xl"}`}>
        <div className="mx-auto mb-8 max-w-3xl">
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-teal-400 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="grid grid-cols-8 gap-2">
            {Array.from({ length: stepCount }).map((_, index) => (
              <div
                key={index}
                className={`h-3 w-3 rounded-full border transition-all ${
                  index < stepIndex
                    ? "border-teal-300 bg-teal-300"
                    : index === stepIndex
                      ? "animate-pulse border-teal-300 bg-teal-400"
                      : "border-white/35 bg-transparent"
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >

        {stepIndex === 0 ? <BusinessNameStep businessName={input.businessName} onChange={(value) => setInput((current) => ({ ...current, businessName: value }))} /> : null}

        {stepIndex === 1 ? (
          <IndustryStep
            selectedIndustry={input.industry}
            customIndustry={customIndustry}
            industryFeedback={industryFeedback}
            onIndustrySelect={onIndustrySelect}
            onCustomIndustryChange={(value) => {
              setCustomIndustry(value);
              setInput((current) => ({ ...current, industry: "custom", offerType: value || current.offerType }));
            }}
          />
        ) : null}

        {stepIndex === 2 ? (
          <DescriptionStep
            description={input.businessDescription}
            onChange={(value) => setInput((current) => ({ ...current, businessDescription: value }))}
          />
        ) : null}

        {stepIndex === 3 ? (
          <ClientsStep
            clientLabel={input.clientLabel}
            customClientLabel={customClientLabel}
            clientDescription={input.clientDescription}
            contactPlural={contactPlural}
            onClientLabelSelect={onClientLabelSelect}
            onCustomClientLabelChange={(value) => {
              setCustomClientLabel(value);
              if (value.trim()) {
                setInput((current) => ({ ...current, clientLabel: normalizeLabel(value) }));
              }
            }}
            onClientDescriptionChange={(value) => setInput((current) => ({ ...current, clientDescription: value }))}
          />
        ) : null}

        {stepIndex === 4 ? (
          <ProcessStep
            stages={input.stages}
            processDescription={input.processDescription}
            draggedStageIndex={draggedStageIndex}
            onDragStart={(index) => setDraggedStageIndex(index)}
            onDropAt={(index) => {
              if (draggedStageIndex !== null) {
                moveStage(draggedStageIndex, index);
                setDraggedStageIndex(null);
              }
            }}
            onDragEnd={() => setDraggedStageIndex(null)}
            onStageChange={updateStage}
            onRemoveStage={removeStage}
            onAddStage={addStage}
            onProcessDescriptionChange={updateProcessDescription}
          />
        ) : null}

        {stepIndex === 5 ? (
          <VoiceStep
            communicationStyle={input.communicationStyle}
            showVoiceDetails={showVoiceDetails}
            vocabulary={input.vocabulary}
            avoidWords={input.avoidWords}
            onToneSelect={(value) => setInput((current) => ({ ...current, communicationStyle: value }))}
            onToggleVoiceDetails={() => setShowVoiceDetails((current) => !current)}
            onVocabularyChange={(value) => setInput((current) => ({ ...current, vocabulary: parseCommaList(value) }))}
            onAvoidWordsChange={(value) => setInput((current) => ({ ...current, avoidWords: parseCommaList(value) }))}
          />
        ) : null}

        {stepIndex === 6 ? <PrioritiesStep priorities={input.priorities} onTogglePriority={togglePriority} /> : null}

        {stepIndex === 7 ? (
          <RevealStep
            businessName={input.businessName}
            contactPlural={contactPlural}
            stages={input.stages}
            industry={input.industry}
            communicationStyle={input.communicationStyle}
            priorities={input.priorities}
            previewSoul={previewSoul}
            error={error}
          />
        ) : null}

        <div className={`mx-auto mt-6 flex w-full ${stepIndex === 7 ? "max-w-6xl" : "max-w-5xl"} justify-between gap-3`}>
          <button type="button" className="crm-button-secondary h-10 px-4" onClick={goBack} disabled={stepIndex === 0 || pending}>
            Back
          </button>

          {stepIndex === 7 ? (
            <button type="button" className="crm-button-primary h-11 px-5" onClick={save} disabled={pending || !previewSoul}>
              {pending ? "Launching..." : "Launch my system →"}
            </button>
          ) : (
            <button type="button" className="crm-button-primary h-10 px-4" onClick={goNext} disabled={!canContinue || pending}>
              {pending ? "Generating..." : "Continue"}
            </button>
          )}
        </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
