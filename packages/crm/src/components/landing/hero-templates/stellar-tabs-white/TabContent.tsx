import type React from "react";

// v1.43.0 — Cycling tab overlay mockups for stellar-tabs-white hero.
//
// 4 small visual mocks corresponding to the four product-flow tabs. Each
// is purely presentational (no live data). The tabs cycle every 4s; the
// active tab's overlay fades in over a soft gradient background.
//
// Tabs map to the universal small-business product flow that every
// SeldonFrame workspace ships:
//   1. Intake — capture leads via the intake form
//   2. Schedule — booking calendar
//   3. Convert — CRM pipeline
//   4. Deliver — client portal / completed work
//
// This is the "you get all of this" visual for the hero.

import {
  Sparkles,
  Calendar,
  Inbox,
  CheckCircle2,
  ArrowRight,
  Clock,
  Mail,
} from "lucide-react";

export const STELLAR_TABS = [
  { id: "intake", label: "Intake", Icon: Mail },
  { id: "schedule", label: "Schedule", Icon: Calendar },
  { id: "convert", label: "Convert", Icon: Inbox },
  { id: "deliver", label: "Deliver", Icon: CheckCircle2 },
] as const;

export type StellarTabId = (typeof STELLAR_TABS)[number]["id"];

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute left-1/2 top-1/2 w-[min(92%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 text-left"
      style={{ boxShadow: "0 25px 80px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}
    >
      {children}
    </div>
  );
}

function IntakePanel() {
  return (
    <CardShell>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-indigo-500" />
        <span className="text-xs font-semibold text-[#0a0a0a]">
          New inquiry · 2 min ago
        </span>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-[#0a0a0a]/55">Name</span>
          <span className="font-medium text-[#0a0a0a]">Sarah Chen</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#0a0a0a]/55">Email</span>
          <span className="font-medium text-[#0a0a0a]">sarah@acme.co</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#0a0a0a]/55">Project</span>
          <span className="font-medium text-[#0a0a0a]">Brand refresh</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#0a0a0a]/55">Budget</span>
          <span className="font-medium text-[#0a0a0a]">$10k — $25k</span>
        </div>
      </div>
      <button className="mt-4 flex w-full items-center justify-between rounded-lg bg-[#0a0a0a] px-3 py-2 text-xs font-medium text-white">
        Reply with template
        <ArrowRight className="size-3.5" />
      </button>
    </CardShell>
  );
}

function SchedulePanel() {
  const SLOTS = [
    { time: "9:00 AM", taken: true },
    { time: "10:30 AM", taken: false },
    { time: "12:00 PM", taken: true },
    { time: "2:00 PM", taken: false },
    { time: "3:30 PM", taken: false },
    { time: "5:00 PM", taken: true },
  ];
  return (
    <CardShell>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#0a0a0a]">
          Wednesday · Mar 19
        </span>
        <span className="text-[10px] text-[#0a0a0a]/55">3 open</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {SLOTS.map((s) => (
          <button
            key={s.time}
            disabled={s.taken}
            className={
              "rounded-md px-2 py-1.5 text-[10px] font-medium " +
              (s.taken
                ? "cursor-not-allowed bg-black/[0.04] text-[#0a0a0a]/30 line-through"
                : "border border-indigo-500/40 bg-indigo-500/5 text-indigo-600 hover:bg-indigo-500/10")
            }
          >
            {s.time}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 rounded-md bg-indigo-500/[0.06] px-2.5 py-2 text-[10px]">
        <Clock className="size-3 text-indigo-600" />
        <span className="text-[#0a0a0a]/70">
          New booking confirmed at <strong>10:30 AM</strong>
        </span>
      </div>
    </CardShell>
  );
}

function ConvertPanel() {
  const STAGES = [
    { label: "Inquiry", count: 8 },
    { label: "Discovery", count: 5, active: true },
    { label: "Proposal", count: 3 },
    { label: "Active", count: 11 },
  ];
  return (
    <CardShell>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#0a0a0a]">Pipeline</span>
        <span className="text-[10px] text-[#0a0a0a]/55">27 deals · $84k</span>
      </div>
      <div className="space-y-1.5">
        {STAGES.map((s) => (
          <div
            key={s.label}
            className={
              "flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs " +
              (s.active ? "bg-[#0a0a0a]/[0.06]" : "")
            }
          >
            <span className="font-medium text-[#0a0a0a]">{s.label}</span>
            <span className="text-[#0a0a0a]/55">{s.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-2 text-[10px]">
        <ArrowRight className="size-3 text-emerald-600" />
        <span className="text-[#0a0a0a]/70">
          Sarah Chen moved to <strong>Proposal</strong>
        </span>
      </div>
    </CardShell>
  );
}

function DeliverPanel() {
  const TASKS = [
    { label: "Kickoff call", done: true },
    { label: "Brand audit + research", done: true },
    { label: "Logo concepts (3 directions)", done: true },
    { label: "Final brand guidelines", done: false },
  ];
  return (
    <CardShell>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#0a0a0a]">
          Brand refresh · Acme Co.
        </span>
        <span className="text-[10px] font-medium text-emerald-600">75% done</span>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-black/[0.06]">
        <div className="h-full w-3/4 bg-emerald-500" />
      </div>
      <div className="space-y-1.5">
        {TASKS.map((t) => (
          <div key={t.label} className="flex items-center gap-2 text-xs">
            <CheckCircle2
              className={t.done ? "size-3.5 text-emerald-500" : "size-3.5 text-[#0a0a0a]/15"}
              strokeWidth={t.done ? 2.5 : 2}
            />
            <span
              className={t.done ? "text-[#0a0a0a]/55 line-through" : "text-[#0a0a0a]"}
            >
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

const PANELS: Record<StellarTabId, () => React.ReactElement> = {
  intake: IntakePanel,
  schedule: SchedulePanel,
  convert: ConvertPanel,
  deliver: DeliverPanel,
};

export function TabContent({ activeId }: { activeId: StellarTabId }) {
  const Panel = PANELS[activeId];
  return <Panel />;
}
