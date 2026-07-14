// packages/crm/src/components/landing/marketing-agent-marquee.tsx
//
// The two on-ramps, made concrete. Seldon builds an agent two ways, and this
// section shows the catalog for each as a scrolling marquee. Each card shows
// the REAL tool logos that agent works through (Gmail + Sheets + HubSpot…) and
// links to /record so a visitor can go build their own.
//   • Path A — DESCRIBE it → Seldon generates (voice receptionist, speed-to-lead…).
//   • Path B — RECORD it → Seldon compiles (inbox triage, a Sheets lead log…).
//
// Rides the vendored Marquee; each row pauses on hover. Dark-slab styling.

"use client";

import Link from "next/link";
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

type Agent = { name: string; vertical: string; icon: LucideIcon; tools: string[] };

const T = (name: string) => `/brand/integrations/${name}.svg`;

// Path A — describe it, Seldon generates it (customer-facing, real-time).
const DESCRIBE: Agent[] = [
  { name: "Voice receptionist", vertical: "for an HVAC company", icon: Phone, tools: ["twilio", "google-calendar", "hubspot"] },
  { name: "Speed-to-lead texter", vertical: "for a roofing company", icon: Zap, tools: ["twilio", "gmail", "hubspot"] },
  { name: "Missed-call text-back", vertical: "for a med spa", icon: PhoneOff, tools: ["twilio", "google-calendar"] },
  { name: "Review requester", vertical: "for a dental practice", icon: Star, tools: ["gmail", "twilio"] },
  { name: "Win-back agent", vertical: "for a gym", icon: RotateCcw, tools: ["gmail", "twilio", "hubspot"] },
  { name: "Website chat concierge", vertical: "for a law firm", icon: MessageSquare, tools: ["gmail", "google-calendar", "slack"] },
  { name: "After-hours answering", vertical: "for a plumber", icon: Moon, tools: ["twilio", "google-calendar"] },
  { name: "Quote responder", vertical: "for a landscaper", icon: FileText, tools: ["gmail", "google-sheets", "stripe"] },
  { name: "No-show reducer", vertical: "for a salon", icon: BellRing, tools: ["twilio", "google-calendar"] },
  { name: "Waitlist filler", vertical: "for a clinic", icon: CalendarClock, tools: ["twilio", "google-calendar", "gmail"] },
];

// Path B — record it, Seldon compiles it (back-office ops you do by hand).
const RECORD: Agent[] = [
  { name: "Inbox triage & drafts", vertical: "for a real-estate team", icon: Inbox, tools: ["gmail", "slack", "notion"] },
  { name: "Inbox organizer", vertical: "label · archive · zero-inbox", icon: Archive, tools: ["gmail", "outlook"] },
  { name: "Google Sheets lead log", vertical: "new lead → enriched row", icon: Table, tools: ["google-sheets", "gmail", "hubspot"] },
  { name: "Scheduling assistant", vertical: "reads the thread, books it", icon: CalendarCheck, tools: ["google-calendar", "gmail", "teams"] },
  { name: "Lead scraper → CRM", vertical: "for an agency", icon: Database, tools: ["firecrawl", "google-sheets", "hubspot"] },
  { name: "Invoice processor", vertical: "attachment → accounting", icon: Receipt, tools: ["gmail", "stripe", "google-sheets"] },
  { name: "CRM updater", vertical: "call outcome → the contact", icon: UserCheck, tools: ["hubspot", "gmail", "slack"] },
  { name: "Proposal drafter", vertical: "template + CRM data", icon: FileSignature, tools: ["google-docs", "hubspot", "stripe"] },
  { name: "Weekly report builder", vertical: "the numbers → a digest", icon: BarChart3, tools: ["google-sheets", "slack", "notion"] },
  { name: "Content repurposer", vertical: "one call → posts + summary", icon: Repeat, tools: ["youtube", "x", "notion"] },
  { name: "Order-status updater", vertical: "supplier emails → tracker", icon: Truck, tools: ["gmail", "google-sheets", "slack"] },
  { name: "Onboarding form filler", vertical: "intake → filled docs", icon: ClipboardCheck, tools: ["google-docs", "gmail", "hubspot"] },
  { name: "White-label receptionist", vertical: "one per client, your brand", icon: Building2, tools: ["twilio", "google-calendar", "hubspot"] },
  { name: "Client onboarding agent", vertical: "for an agency", icon: UserPlus, tools: ["gmail", "notion", "slack"] },
  { name: "Agency reporting agent", vertical: "per-client → branded report", icon: PieChart, tools: ["google-sheets", "slack", "hubspot"] },
  { name: "MCP-endpoint agent", vertical: "rentable by other LLMs", icon: Plug, tools: ["github", "slack", "notion"] },
];

function AgentChip({ agent }: { agent: Agent }) {
  const Icon = agent.icon;
  return (
    <Link
      href="/record"
      className="group flex w-[268px] shrink-0 flex-col gap-3 rounded-[13px] border border-[rgba(255,255,255,.1)] bg-[#243830] px-4 py-3.5 transition-colors hover:border-[rgba(246,242,234,.4)]"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(246,242,234,.12)] text-[#F6F2EA]">
          <Icon className="size-[16px]" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-[600] leading-tight text-[#F6F2EA]">
            {agent.name}
          </span>
          <span className="block truncate text-[11.5px] leading-tight text-[rgba(246,242,234,.62)]">
            {agent.vertical}
          </span>
        </span>
      </span>

      {/* the real tools this agent works through */}
      <span className="flex items-center gap-1.5">
        {agent.tools.map((t) => (
          <span
            key={t}
            className="flex size-[22px] items-center justify-center rounded-full border border-[rgba(255,255,255,.08)] bg-[#FFFDFA]"
            title={t}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static vendored SVG */}
            <img src={T(t)} alt="" width={12} height={12} className="block" loading="lazy" />
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-[600] text-[rgba(246,242,234,.55)] transition-all group-hover:text-[#F6F2EA]">
          Build this →
        </span>
      </span>
    </Link>
  );
}

function RowLabel({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center justify-center gap-2 text-center text-[12px] font-[600] text-[#F6F2EA]">
      <span className="rounded-full bg-[rgba(246,242,234,.16)] px-2 py-0.5 text-[10.5px] font-[700] uppercase tracking-[0.06em] text-[#F6F2EA]">
        {kicker}
      </span>
      <span className="text-[rgba(246,242,234,.72)]">{children}</span>
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
