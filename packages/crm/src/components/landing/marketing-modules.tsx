// packages/crm/src/components/landing/marketing-modules.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// "What you get" — feature cards. White card surfaces on paper background,
// SeldonFrame green (#00897B) accent icons, Newsreader italic headline.

import type { ReactNode } from "react";
import { Bot, Calendar, FileText, MessageSquare, Phone, Star, Users } from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    title: "CRM",
    body: "Leads, deals, tasks, and notes — all tied to the contact, not a spreadsheet. Built for local service businesses.",
    mock: <CrmMock />,
  },
  {
    icon: Calendar,
    title: "Booking page",
    body: "Calendar-first booking tied to live availability. Confirmed bookings flow straight into the CRM.",
    mock: <CalendarMock />,
  },
  {
    icon: FileText,
    title: "Intake form",
    body: "Pre-qualified leads with full context — logic-aware fields adapt by service type.",
    mock: <FormMock />,
  },
  {
    icon: MessageSquare,
    title: "AI receptionist",
    body: "Trained on the workspace soul. Books appointments and qualifies leads in the client's own voice.",
    mock: <ChatMock />,
  },
  {
    icon: Phone,
    title: "Missed-call text-back",
    body: "Can't pick up? It texts them back in under 60 seconds — before they dial the next company.",
    mock: <SmsMock />,
  },
  {
    icon: Star,
    title: "Review Requester",
    body: "After a good job, it quietly asks happy customers for a 5-star Google review at exactly the right moment.",
    mock: <ReviewMock />,
  },
] as const;

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
      aria-label="Features"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="section-head-center text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
            Everything you get
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
          </div>
          <h2 className="mx-auto mt-3.5 max-w-[20ch] text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]">
            Your whole front office —{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic">
              wired together.
            </em>
          </h2>
          <p className="mx-auto mt-4 max-w-[54ch] text-[clamp(15.5px,1.9vw,18px)] leading-[1.55] text-[#6E665A]">
            One system. Change a phone number once and the CRM, booking page,
            intake form, and chatbot all update — instantly.
          </p>
        </div>

        {/* Feature grid */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feat) => (
            <article
              key={feat.title}
              className="flex flex-col gap-4 overflow-hidden rounded-[16px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] p-6 shadow-[0_1px_2px_rgba(34,29,23,.05),0_10px_30px_rgba(34,29,23,.07)]"
            >
              <FeatureHead icon={feat.icon} label={feat.title} />
              <p className="m-0 text-[13.5px] leading-[1.5] text-[#6E665A]">{feat.body}</p>
              <div className="mt-auto">{feat.mock}</div>
            </article>
          ))}
        </div>

        {/* Agents callout */}
        <div className="mt-5 rounded-[18px] border border-[rgba(0,137,123,.20)] bg-[#1F2B24] p-6 shadow-[0_24px_60px_rgba(31,43,36,.20)]">
          <div className="inline-flex items-center gap-2.5">
            <span className="inline-flex size-7 items-center justify-center rounded-md border border-[rgba(0,137,123,.35)] bg-[rgba(0,137,123,.20)] text-[#6fc28f]">
              <Bot size={14} aria-hidden />
            </span>
            <span className="font-sans text-[11px] font-[600] uppercase tracking-[0.12em] text-[#6fc28f]">
              Plus: a growing agents library
            </span>
          </div>
          <p className="mt-3.5 max-w-[760px] text-[14.5px] leading-[1.55] text-[rgba(246,242,234,.82)]">
            Spin up purpose-built AI agents in one click on top of any workspace.{" "}
            <strong className="font-[500] text-[#FFFDFA]">Speed-to-Lead</strong> calls inbound leads within 60 seconds.{" "}
            <strong className="font-[500] text-[#FFFDFA]">Review Agent</strong> asks happy customers for a Google review at the right moment.{" "}
            <strong className="font-[500] text-[#FFFDFA]">Reactivation Agent</strong> wakes up cold leads on a cadence.{" "}
            <strong className="font-[500] text-[#FFFDFA]">Quote Agent</strong> drafts and sends estimates. New agents ship every month.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {AGENTS.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,.12)] bg-[rgba(255,255,255,.06)] px-3 py-1.5 text-[12.5px] font-[500] text-[rgba(246,242,234,.88)]"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-[#6fc28f] shadow-[0_0_0_3px_rgba(111,194,143,.22)]" aria-hidden />
                {name}
              </span>
            ))}
            <span className="inline-flex items-center rounded-full border border-dashed border-[rgba(255,255,255,.14)] bg-transparent px-3 py-1.5 font-sans text-[11px] tracking-[0.04em] text-[rgba(246,242,234,.45)]">
              + more shipping monthly
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureHead({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex size-[42px] items-center justify-center rounded-[12px] bg-[#EFE9DD] text-[#00897B]">
        <Icon size={21} strokeWidth={1.7} aria-hidden />
      </span>
      <h3 className="m-0 text-[15.5px] font-[600] tracking-[-0.01em] text-[#221D17]">{label}</h3>
    </div>
  );
}

function CrmMock() {
  const rows = [
    { name: "Diane M.", tone: "new", amount: "$1,840" },
    { name: "Marcus V.", tone: "warm", amount: "$4,200" },
    { name: "Hartmann Fmly.", tone: "book", amount: "$2,650" },
    { name: "Reyes Co.", tone: "new", amount: "$980" },
  ] as const;
  const tagStyles: Record<"new" | "warm" | "book", string> = {
    new: "bg-[rgba(0,137,123,.12)] text-[#00897B]",
    warm: "bg-[rgba(234,179,8,.12)] text-[#a16207]",
    book: "bg-[rgba(34,197,94,.12)] text-[#166534]",
  };
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-3.5 font-mono text-[11.5px]">
      {rows.map((row) => (
        <div key={row.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 rounded-md border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] px-2 py-1.5">
          <span className="font-[500] text-[#221D17]">{row.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.06em] ${tagStyles[row.tone]}`}>
            {row.tone === "book" ? "booked" : row.tone}
          </span>
          <span className="tabular-nums text-[#6E665A]">{row.amount}</span>
        </div>
      ))}
    </div>
  );
}

function CalendarMock() {
  const days: { d: string; state: "h" | "" | "b" | "t" }[] = [
    { d: "M", state: "h" }, { d: "T", state: "h" }, { d: "W", state: "h" },
    { d: "T", state: "h" }, { d: "F", state: "h" }, { d: "S", state: "h" }, { d: "S", state: "h" },
    { d: "2", state: "" }, { d: "3", state: "b" }, { d: "4", state: "" },
    { d: "5", state: "b" }, { d: "6", state: "" }, { d: "7", state: "" }, { d: "8", state: "" },
    { d: "9", state: "" }, { d: "10", state: "b" }, { d: "11", state: "t" },
    { d: "12", state: "" }, { d: "13", state: "b" }, { d: "14", state: "" }, { d: "15", state: "" },
  ];
  return (
    <div className="grid grid-cols-7 gap-1 rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-3.5">
      {days.map((day, i) => (
        <span
          key={i}
          className={`flex aspect-square items-center justify-center rounded-md border font-mono text-[10px] ${
            day.state === "b"
              ? "border-[rgba(0,137,123,.35)] bg-[rgba(0,137,123,.15)] text-[#00897B]"
              : day.state === "t"
              ? "border-[rgba(34,29,23,.18)] bg-[#FFFDFA] text-[#221D17]"
              : day.state === "h"
              ? "border-transparent bg-transparent text-[#9A9183]"
              : "border-[rgba(34,29,23,.06)] bg-[#FFFDFA] text-[#9A9183]"
          }`}
        >
          {day.d}
        </span>
      ))}
    </div>
  );
}

function FormMock() {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-3.5">
      <FormField filled>Diane M.</FormField>
      <FormField filled>(209) 555-0144</FormField>
      <FormField focused>AC repair · same day</FormField>
      <div className="mt-1 flex h-[30px] items-center justify-center rounded-md bg-[#00897B] font-mono text-[11px] font-[600] text-[#FFFDFA]">
        Send
      </div>
    </div>
  );
}

function FormField({ children, filled, focused }: { children: ReactNode; filled?: boolean; focused?: boolean }) {
  return (
    <div
      className={`flex h-7 items-center rounded-md border px-2.5 font-mono text-[11px] ${
        focused
          ? "border-[#00897B] bg-[#FFFDFA] text-[#221D17] shadow-[0_0_0_2px_rgba(0,137,123,.15)]"
          : filled
          ? "border-[rgba(34,29,23,.12)] bg-[#FFFDFA] text-[#221D17]"
          : "border-[rgba(34,29,23,.08)] bg-[#FFFDFA] text-[#9A9183]"
      }`}
    >
      {children}
    </div>
  );
}

function ChatMock() {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-3.5 font-mono text-[11px]">
      <ChatBubble who="bot">How can I help with your HVAC today?</ChatBubble>
      <ChatBubble who="user">My AC is out</ChatBubble>
      <ChatBubble who="bot">Got it — when can a tech come by?</ChatBubble>
      <ChatBubble who="user">Tonight?</ChatBubble>
    </div>
  );
}

function ChatBubble({ who, children }: { who: "bot" | "user"; children: ReactNode }) {
  return (
    <div className={`max-w-[80%] rounded-[14px] px-3 py-2 text-[11px] leading-[1.4] ${
      who === "bot"
        ? "self-start rounded-bl-[4px] bg-[#FFFDFA] text-[#221D17] shadow-[0_1px_3px_rgba(34,29,23,.08)]"
        : "self-end rounded-br-[4px] bg-[#1F2B24] text-[#F6F2EA]"
    }`}>
      {children}
    </div>
  );
}

function SmsMock() {
  return (
    <div className="rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-3.5">
      <div className="text-[10.5px] text-center text-[#9A9183] mb-2 font-sans">Today 2:14 PM</div>
      <ChatBubble who="bot">Hey — sorry we missed you! Want a quick callback? Two slots open today:</ChatBubble>
      <div className="mt-1.5"><ChatBubble who="bot">Wed 10:30 AM · Wed 4:15 PM</ChatBubble></div>
      <div className="mt-1.5"><ChatBubble who="user">Wed 4:15 works</ChatBubble></div>
      <div className="mt-1.5"><ChatBubble who="bot">Booked for Wed 4:15. See you then!</ChatBubble></div>
      <div className="text-[10.5px] text-center text-[#00897B] mt-2 font-sans">Replied in 47 seconds</div>
    </div>
  );
}

function ReviewMock() {
  return (
    <div className="rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-3.5">
      <div className="text-[10.5px] text-center text-[#9A9183] mb-2 font-sans">2 days after job completion</div>
      <ChatBubble who="bot">Hi Marcus — hope the AC repair went well! If you have 30 seconds, a quick Google review would mean a lot to us. ⭐</ChatBubble>
      <div className="mt-2 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-[rgba(34,29,23,.12)] bg-[#FFFDFA] px-3 py-1 text-[11px] font-[500] text-[#221D17] shadow-[0_1px_3px_rgba(34,29,23,.06)]">
          {"⭐⭐⭐⭐⭐"} Leave a review
        </div>
      </div>
    </div>
  );
}
