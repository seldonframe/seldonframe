"use client";

// Cut C onboarding-pivot — Hero dashboard mockup.
//
// Replaces the placeholder `hero-loop.gif` with a Tailwind + lucide
// composition that reads as a real product screenshot at hero scale.
// The mockup visualises the dream outcome: an agency operator has
// just spun up "Acme HVAC" as a client workspace; the pipeline is
// live, the chatbot is online, and the team can hand it over.
//
// Design-system spec (from design:design-system pass):
//   - Outer:  rounded-2xl border-zinc-800 bg-zinc-900 shadow-2xl
//             shadow-black/40 with a ring-1 ring-white/[0.04] glass
//             accent — matches the FAQ / how-it-works card rhythm.
//   - Sidebar: w-48, bg-zinc-950/60, divider border-zinc-800/60,
//             text-xs zinc-400 rows, lucide icons sized 3.5.
//   - Kanban:  4 cols (auto on md+, single col on mobile via overflow
//             scroll). Card border zinc-800, body text [11px], price
//             text-emerald-400 for the "this is real money" tell.
//   - Motion:  motion@12.38 from "motion/react". Stagger cards
//             0.06s apart starting at 0.30s. useReducedMotion() →
//             initial=false so the final state renders instantly.
//   - Pulse:   Tailwind animate-pulse on the agent dot,
//             motion-reduce:animate-none for the static fallback.
//
// Accessibility: the mockup is purely decorative for the hero pitch
// and is wrapped in role="img" + aria-label so screen readers get
// the one-sentence summary instead of every kanban card.

import {
  Bot,
  Calendar,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type KanbanCard = {
  title: string;
  meta: string;
  price: string;
};

type KanbanColumn = {
  label: string;
  count: number;
  cards: readonly KanbanCard[];
};

const COLUMNS: readonly KanbanColumn[] = [
  { label: "New Lead", count: 0, cards: [] },
  {
    label: "Quoted",
    count: 2,
    cards: [
      { title: "AC repair", meta: "5012 N 32nd St", price: "$340" },
      { title: "Furnace tune-up", meta: "Glendale", price: "$120" },
    ],
  },
  {
    label: "Scheduled",
    count: 1,
    cards: [
      { title: "AC Install", meta: "May 10 · 2pm", price: "$4,800" },
    ],
  },
  { label: "Won", count: 0, cards: [] },
];

const NAV_ITEMS: readonly { label: string; icon: typeof LayoutDashboard }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Customers", icon: Users },
  { label: "Bookings", icon: Calendar },
  { label: "Agents", icon: Bot },
  { label: "Pages", icon: FileText },
  { label: "Intake Forms", icon: ClipboardList },
];

export function LandingHeroMockup() {
  const reduced = useReducedMotion();
  // Stagger card entrance after the hero copy has settled.
  // 0.30s warms in after H1 → subhead → CTAs (0.0/0.08/0.16/0.24).
  const cardEntry = (delay: number) =>
    reduced
      ? { initial: false as const, animate: { opacity: 1, scale: 1 } }
      : {
          initial: { opacity: 0, scale: 0.97 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div
      role="img"
      aria-label="SeldonFrame workspace dashboard for Acme HVAC: pipeline showing one scheduled $4,800 AC install, AI chatbot live, white-label sidebar."
      className="relative w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]"
    >
      {/* Soft teal radial behind the card — sells "primary surface" */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-[#14b8a6]/10 blur-3xl"
      />

      {/* Window chrome */}
      <div className="relative flex items-center gap-2 border-b border-zinc-800/60 bg-zinc-950/80 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="ml-3 text-[11px] text-zinc-500">acme-hvac.app.seldonframe.com</span>
      </div>

      <div className="relative flex min-h-[360px] flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="border-b border-zinc-800/60 bg-zinc-950/60 px-3 py-4 md:w-48 md:shrink-0 md:border-b-0 md:border-r">
          {/* Workspace switcher */}
          <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#14b8a6]/15 text-[11px] font-bold text-[#14b8a6]">
              AH
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-zinc-100">Acme HVAC</p>
              <p className="truncate text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Active workspace
              </p>
            </div>
          </div>

          {/* Nav */}
          <nav className="mt-4 space-y-0.5" aria-hidden="true">
            {NAV_ITEMS.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === 0;
              return (
                <div
                  key={item.label}
                  className={
                    isActive
                      ? "flex items-center justify-between gap-2 rounded-md bg-zinc-800/70 px-2 py-1.5 text-xs font-medium text-zinc-100"
                      : "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-400"
                  }
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {item.label}
                  </span>
                  <span className="size-1.5 rounded-full bg-emerald-500/70" />
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Main panel */}
        <div className="flex-1 px-4 py-4 md:px-5">
          {/* Header */}
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Pipeline</h3>
              <p className="text-[11px] text-zinc-500">Acme HVAC · Opportunities</p>
            </div>
            <span className="hidden rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 sm:inline-flex">
              This week
            </span>
          </div>

          {/* Kanban */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {COLUMNS.map((col, colIdx) => (
              <div key={col.label} className="min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {col.label}
                  </p>
                  <span className="text-[11px] tabular-nums text-zinc-600">
                    {col.count}
                  </span>
                </div>
                <div className="space-y-2">
                  {col.cards.length === 0 ? (
                    <div className="rounded-md border border-dashed border-zinc-800/70 bg-zinc-950/40 px-2 py-3 text-center text-[10px] text-zinc-600">
                      Empty
                    </div>
                  ) : (
                    col.cards.map((card, cardIdx) => {
                      // Cumulative delay across columns so cards
                      // animate left-to-right rather than per-column.
                      const flatIdx =
                        COLUMNS.slice(0, colIdx).reduce(
                          (acc, c) => acc + c.cards.length,
                          0,
                        ) + cardIdx;
                      return (
                        <motion.div
                          key={card.title}
                          {...cardEntry(0.3 + flatIdx * 0.06)}
                          className="rounded-md border border-zinc-800 bg-zinc-900 p-2.5 text-[11px] shadow-sm shadow-black/20"
                        >
                          <p className="font-medium text-zinc-100">{card.title}</p>
                          <p className="mt-0.5 text-zinc-500">{card.meta}</p>
                          <p className="mt-1.5 font-medium text-emerald-400 tabular-nums">
                            {card.price}
                          </p>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom status strip — agent health */}
          <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] font-medium text-zinc-200">
                Acme HVAC Bot v1
              </span>
              <span className="text-[11px] text-zinc-500">· live</span>
            </div>
            <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-emerald-400">
              200 ok
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
