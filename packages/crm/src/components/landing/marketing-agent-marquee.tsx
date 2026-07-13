// packages/crm/src/components/landing/marketing-agent-marquee.tsx
//
// The two on-ramps, made concrete (2026-07-13). SeldonFrame builds an agent
// two ways, and this section shows the catalog for each as a scrolling
// marquee:
//   • Path A — DESCRIBE it → Seldon generates. Agents you want but don't have and
//     can't record because they don't exist yet (voice receptionist,
//     speed-to-lead, review requester…).
//   • Path B — RECORD it → Seldon compiles. Agents that replace a workflow you
//     already do by hand or badly automate (inbox triage, a Sheets lead log,
//     a scraper→CRM…).
//
// Rides the vendored Marquee (components/ui/marquee.tsx); each row pauses on
// hover. Dark-slab styling (this section is buildStack/dark-only). Chips are
// plain DOM + lucide icons — SSR-visible, reduced-motion just stops the CSS
// marquee (no per-item JS).

"use client";

import {
  Archive,
  BarChart3,
  BellRing,
  Building2,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  Database,
  FileSignature,
  FileText,
  Inbox,
  MessageSquare,
  Moon,
  PhoneOff,
  Phone,
  PieChart,
  Plug,
  Receipt,
  Repeat,
  RotateCcw,
  Star,
  Table,
  Truck,
  UserCheck,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Marquee } from "@/components/ui/marquee";

type Agent = { name: string; vertical: string; icon: LucideIcon };

// Path A — describe it, Seldon generates it (customer-facing, real-time).
const DESCRIBE: Agent[] = [
  { name: "Voice receptionist", vertical: "for an HVAC company", icon: Phone },
  { name: "Speed-to-lead texter", vertical: "for a roofing company", icon: Zap },
  { name: "Missed-call text-back", vertical: "for a med spa", icon: PhoneOff },
  { name: "Review requester", vertical: "for a dental practice", icon: Star },
  { name: "Win-back agent", vertical: "for a gym", icon: RotateCcw },
  { name: "Website chat concierge", vertical: "for a law firm", icon: MessageSquare },
  { name: "After-hours answering", vertical: "for a plumber", icon: Moon },
  { name: "Quote responder", vertical: "for a landscaper", icon: FileText },
  { name: "No-show reducer", vertical: "for a salon", icon: BellRing },
  { name: "Waitlist filler", vertical: "for a clinic", icon: CalendarClock },
];

// Path B — record it, Seldon compiles it (back-office ops you do by hand).
const RECORD: Agent[] = [
  { name: "Inbox triage & drafts", vertical: "for a real-estate team", icon: Inbox },
  { name: "Inbox organizer", vertical: "label · archive · zero-inbox", icon: Archive },
  { name: "Google Sheets lead log", vertical: "new lead → enriched row", icon: Table },
  { name: "Scheduling assistant", vertical: "reads the thread, books it", icon: CalendarCheck },
  { name: "Lead scraper → CRM", vertical: "for an agency", icon: Database },
  { name: "Invoice processor", vertical: "attachment → accounting", icon: Receipt },
  { name: "CRM updater", vertical: "call outcome → the contact", icon: UserCheck },
  { name: "Proposal drafter", vertical: "template + CRM data", icon: FileSignature },
  { name: "Weekly report builder", vertical: "the numbers → a digest", icon: BarChart3 },
  { name: "Content repurposer", vertical: "one call → posts + summary", icon: Repeat },
  { name: "Order-status updater", vertical: "supplier emails → tracker", icon: Truck },
  { name: "Onboarding form filler", vertical: "intake → filled docs", icon: ClipboardCheck },
  { name: "White-label receptionist", vertical: "one per client, your brand", icon: Building2 },
  { name: "Client onboarding agent", vertical: "for an agency", icon: UserPlus },
  { name: "Agency reporting agent", vertical: "per-client → branded report", icon: PieChart },
  { name: "MCP-endpoint agent", vertical: "rentable by other LLMs", icon: Plug },
];

function AgentChip({ agent }: { agent: Agent }) {
  const Icon = agent.icon;
  return (
    <div className="flex w-[248px] shrink-0 items-center gap-3 rounded-[13px] border border-[rgba(255,255,255,.10)] bg-[#243830] px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[rgba(246, 242, 234,.12)] text-[#F6F2EA]">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-[600] leading-tight text-[#F6F2EA]">
          {agent.name}
        </span>
        <span className="block truncate text-[12px] leading-tight text-[rgba(246,242,234,.6)]">
          {agent.vertical}
        </span>
      </span>
    </div>
  );
}

function RowLabel({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-[12px] font-[600] text-[rgba(246,242,234,.85)]">
      <span className="rounded-full bg-[rgba(246, 242, 234,.14)] px-2 py-0.5 text-[10.5px] font-[700] uppercase tracking-[0.06em] text-[#F6F2EA]">
        {kicker}
      </span>
      {children}
    </p>
  );
}

export function MarketingAgentMarquee() {
  return (
    <div className="relative mt-10 flex flex-col gap-6">
      <div>
        <RowLabel kicker="Describe it">Agents you&apos;re missing — Seldon builds them from a sentence</RowLabel>
        <Marquee pauseOnHover className="[--duration:52s] [--gap:0.9rem] py-0">
          {DESCRIBE.map((a) => (
            <AgentChip key={a.name} agent={a} />
          ))}
        </Marquee>
      </div>

      <div>
        <RowLabel kicker="Record it">Workflows you do by hand — Seldon compiles them from one recording</RowLabel>
        <Marquee reverse pauseOnHover className="[--duration:64s] [--gap:0.9rem] py-0">
          {RECORD.map((a) => (
            <AgentChip key={a.name} agent={a} />
          ))}
        </Marquee>
      </div>

      {/* Edge fades so the rows dissolve into the slab instead of hard-cutting. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#1F2B24] to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#1F2B24] to-transparent" aria-hidden />
    </div>
  );
}
