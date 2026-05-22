// packages/crm/src/components/landing/marketing-modules.tsx
//
// 2026-05-22 — Port of HTML §5 WHAT SHIPS. Four modules (CRM,
// Booking, Intake form, AI chatbot) in an asymmetric grid: CRM
// takes the feature slot (col-span 1, row-span 2) on lg+, the
// other three fill out the remaining cells.
//
// The Agents callout below the grid is a teal-tinted plate with
// chip pills — keep it because Speed-to-Lead, Review Agent,
// Reactivation Agent, Quote Agent, and Follow-up Agent are all
// real existing agent archetypes shipped by the agents library.
// "+ more shipping monthly" is the placeholder-ish phrasing the
// HTML uses; truth-pass safe because we ship a new archetype most
// months.

import { Bot, Calendar, FileText, MessageSquare, Users } from "lucide-react";
import { MarketingHeadlineMuted, MarketingSectionHead } from "./marketing-section-head";

const AGENTS = [
  "Speed-to-Lead",
  "Review Agent",
  "Reactivation Agent",
  "Quote Agent",
  "Follow-up Agent",
] as const;

export function MarketingModules() {
  return (
    <section
      id="modules"
      aria-label="What ships"
      className="relative isolate px-5 py-24 md:px-8 md:py-32 lg:px-12 lg:py-36"
    >
      <div className="mx-auto max-w-[1200px]">
        <MarketingSectionHead
          eyebrow="What ships in every workspace"
          headline={
            <>
              Four modules. <MarketingHeadlineMuted>One source of truth.</MarketingHeadlineMuted>
            </>
          }
          sub="Modules don't sit next to each other — they share a workspace soul. Change a phone number once; the CRM, booking page, intake form, and chatbot all update."
        />

        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 sm:gap-5 lg:grid-cols-[1.4fr_1fr_1fr] lg:grid-rows-[auto_auto]">
          {/* CRM — feature card spanning 2 rows on lg+ */}
          <article className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6 lg:row-span-2">
            <Head icon={Users} label="CRM" />
            <p className="m-0 text-sm leading-[1.55] text-zinc-400">
              Leads, deals, tasks, notes. Built around the agency&apos;s pipeline, not a generic Salesforce clone.
              Everything ties back to the contact, not the spreadsheet.
            </p>
            <div className="mt-auto min-h-[180px] rounded-[10px] border border-zinc-800 bg-[#09090b] p-3.5">
              <div className="flex flex-col gap-2 font-mono text-[11.5px]">
                <LeadRow name="Diane M." tone="new" amount="$1,840" />
                <LeadRow name="Marcus V." tone="warm" amount="$4,200" />
                <LeadRow name="Hartmann Fmly." tone="book" amount="$2,650" />
                <LeadRow name="Reyes Co." tone="new" amount="$980" />
                <LeadRow name="Lin O." tone="warm" amount="$3,100" />
              </div>
            </div>
          </article>

          <article className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <Head icon={Calendar} label="Booking" />
            <p className="m-0 text-sm leading-[1.55] text-zinc-400">
              Calendar-first booking page tied to live availability. Confirmed bookings flow straight into the CRM.
            </p>
            <CalendarMock />
          </article>

          <article className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <Head icon={FileText} label="Intake form" />
            <p className="m-0 text-sm leading-[1.55] text-zinc-400">
              Pre-qualified leads land in the CRM with full context. Logic-aware fields adapt by service.
            </p>
            <div className="mt-auto flex min-h-[140px] flex-col gap-2 rounded-[10px] border border-zinc-800 bg-[#09090b] p-3.5">
              <FormField filled>Diane M.</FormField>
              <FormField filled>(209) 555-0144</FormField>
              <FormField focused>AC repair · same day</FormField>
              <div className="mt-1 flex h-[30px] items-center justify-center rounded-md bg-[#14b8a6] font-mono text-[11px] font-semibold text-[#08332f]">
                Send
              </div>
            </div>
          </article>

          <article className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6 sm:col-span-2 lg:col-span-1">
            <Head icon={MessageSquare} label="AI chatbot" />
            <p className="m-0 text-sm leading-[1.55] text-zinc-400">
              Trained on the workspace soul. Books appointments and qualifies leads in the client&apos;s actual voice.
            </p>
            <div className="mt-auto flex min-h-[140px] flex-col gap-1.5 rounded-[10px] border border-zinc-800 bg-[#09090b] p-3.5 font-mono text-[11px]">
              <Bubble who="bot">How can I help with your HVAC today?</Bubble>
              <Bubble who="user">My AC is out</Bubble>
              <Bubble who="bot">Got it — when can a tech come by?</Bubble>
              <Bubble who="user">Tonight?</Bubble>
            </div>
          </article>
        </div>

        {/* Agents callout */}
        <div className="mt-5 flex flex-col gap-3 rounded-[14px] border border-[color-mix(in_oklab,#14b8a6_24%,#27272a)] bg-[linear-gradient(135deg,color-mix(in_oklab,#14b8a6_8%,#18181b)_0%,#18181b_60%)] p-6">
          <div className="inline-flex items-center gap-2.5">
            <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[color-mix(in_oklab,#14b8a6_32%,transparent)] bg-[color-mix(in_oklab,#14b8a6_24%,#27272a)] text-[#5eead4]">
              <Bot size={14} aria-hidden />
            </span>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5eead4]">
              Plus: a growing agents library
            </span>
          </div>
          <p className="m-0 max-w-[760px] text-[14.5px] leading-[1.55] text-zinc-300">
            Spin up purpose-built AI agents in one click on top of the workspace.{" "}
            <b className="font-semibold text-zinc-50">Speed-to-Lead</b> calls inbound leads within 60 seconds.{" "}
            <b className="font-semibold text-zinc-50">Review Agent</b> asks happy customers for a Google review at
            the right moment.{" "}
            <b className="font-semibold text-zinc-50">Reactivation Agent</b> wakes up cold leads on a cadence.{" "}
            <b className="font-semibold text-zinc-50">Quote Agent</b> drafts and sends estimates. New agents ship
            every month.
          </p>
          <div className="mt-0.5 flex flex-wrap gap-2">
            {AGENTS.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-[#09090b]/50 px-3 py-1.5 text-[12.5px] font-medium tracking-tight text-zinc-200"
              >
                <span
                  className="size-1.5 shrink-0 rounded-sm bg-[#2dd4bf]"
                  style={{ boxShadow: "0 0 0 3px color-mix(in oklab, #2dd4bf 18%, transparent)" }}
                  aria-hidden
                />
                {name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-zinc-800 bg-[#09090b]/50 px-3 py-1.5 font-mono text-[11px] tracking-[0.04em] text-zinc-500">
              + more shipping monthly
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Head({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex size-8 items-center justify-center rounded-lg border border-[color-mix(in_oklab,#14b8a6_28%,transparent)] bg-[color-mix(in_oklab,#14b8a6_18%,#27272a)] text-[#5eead4]">
        <Icon size={16} aria-hidden />
      </span>
      <h3 className="m-0 font-display text-lg font-semibold tracking-[-0.015em] text-zinc-50">{label}</h3>
    </div>
  );
}

function LeadRow({
  name,
  tone,
  amount,
}: {
  name: string;
  tone: "new" | "warm" | "book";
  amount: string;
}) {
  const tagStyles: Record<typeof tone, string> = {
    new: "bg-[color-mix(in_oklab,#14b8a6_20%,transparent)] text-[#5eead4]",
    warm: "bg-[color-mix(in_oklab,#facc15_18%,transparent)] text-[#facc15]",
    book: "bg-[color-mix(in_oklab,#10b981_18%,transparent)] text-[#34d399]",
  };
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
      <span className="font-medium text-zinc-200">{name}</span>
      <span
        className={`rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.06em] ${tagStyles[tone]}`}
      >
        {tone === "book" ? "booked" : tone}
      </span>
      <span className="tabular-nums text-zinc-300">{amount}</span>
    </div>
  );
}

function CalendarMock() {
  const days: { d: string; state: "h" | "" | "b" | "t" }[] = [
    { d: "M", state: "h" },
    { d: "T", state: "h" },
    { d: "W", state: "h" },
    { d: "T", state: "h" },
    { d: "F", state: "h" },
    { d: "S", state: "h" },
    { d: "S", state: "h" },
    { d: "2", state: "" },
    { d: "3", state: "b" },
    { d: "4", state: "" },
    { d: "5", state: "b" },
    { d: "6", state: "" },
    { d: "7", state: "" },
    { d: "8", state: "" },
    { d: "9", state: "" },
    { d: "10", state: "b" },
    { d: "11", state: "t" },
    { d: "12", state: "" },
    { d: "13", state: "b" },
    { d: "14", state: "" },
    { d: "15", state: "" },
  ];
  return (
    <div className="mt-auto grid min-h-[140px] grid-cols-7 gap-1 rounded-[10px] border border-zinc-800 bg-[#09090b] p-3.5">
      {days.map((day, i) => (
        <span
          key={i}
          className={`flex aspect-square items-center justify-center rounded-md border font-mono text-[10px] ${
            day.state === "b"
              ? "border-[color-mix(in_oklab,#14b8a6_40%,transparent)] bg-[color-mix(in_oklab,#14b8a6_26%,transparent)] text-[#99f6e4]"
              : day.state === "t"
              ? "border-zinc-600 bg-zinc-900 text-zinc-100"
              : day.state === "h"
              ? "border-zinc-800 bg-zinc-900 text-zinc-500"
              : "border-zinc-800 bg-zinc-900 text-zinc-500"
          }`}
        >
          {day.d}
        </span>
      ))}
    </div>
  );
}

function FormField({
  children,
  filled,
  focused,
}: {
  children: React.ReactNode;
  filled?: boolean;
  focused?: boolean;
}) {
  return (
    <div
      className={`flex h-7 items-center rounded-md border bg-zinc-900 px-2.5 font-mono text-[11px] ${
        focused
          ? "border-[#2dd4bf] text-zinc-200 shadow-[0_0_0_2px_color-mix(in_oklab,#2dd4bf_18%,transparent)]"
          : filled
          ? "border-zinc-800 text-zinc-200"
          : "border-zinc-800 text-zinc-500"
      }`}
    >
      {children}
    </div>
  );
}

function Bubble({ who, children }: { who: "bot" | "user"; children: React.ReactNode }) {
  if (who === "bot") {
    return (
      <div className="max-w-[80%] self-start rounded-[10px] rounded-bl-[4px] border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-zinc-200">
        {children}
      </div>
    );
  }
  return (
    <div className="max-w-[80%] self-end rounded-[10px] rounded-br-[4px] bg-[#14b8a6] px-2.5 py-1.5 font-medium text-[#08332f]">
      {children}
    </div>
  );
}
