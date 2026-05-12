"use client";

// Marketing landing page client component.
// Workstream 2 — Gemini-authored landing with launch-prep fixes (a-g)
// per Max's prompt:
//   a. Footer hrefs replaced with real paths
//   b. HowItWorks animation: x: -30 → y: 20 (vertical reveal parity)
//   c. Featured pricing card: removed scale: 1.02 (teal border is enough)
//   d. Nav Pricing link: /pricing → #pricing (anchor)
//   e. Cost-visibility feature copy reframed (no concrete dollar claims)
//   f. BYO note below pricing reframed (no concrete dollar claims)
//   g. Added "See it built" section between HowItWorks and Pricing
//
// v1.31.0 — Hero rewrite. The previous hero showed a small terminal
// mockup with a `claude mcp add` command and a workspace-creation
// success block. That's true to the install flow but doesn't show
// the launch story's actual magic moment: the eval gate passing
// scenarios before an agent goes live. v1.31.0 replaces the terminal
// with a bigger, animated AgentEvalCard that mocks the /agents/X/evals
// surface — eight scenarios filling in green over ~2 seconds, eval
// progress bar filling to 100%, "Publish unlocked" pill appearing.
// Adds a subtle radial glow behind the hero for Linear-quality depth.

import React from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// CTA buttons render as styled <a> tags rather than <Button asChild>:
// the local Base-UI Button primitive doesn't support `asChild`, and
// CTAs need to be real anchors so target="_blank" + client navigation
// work correctly.
const PRIMARY_CTA_CLS =
  "inline-flex items-center justify-center bg-[#1FAE85] hover:bg-[#24c997] text-[#09090b] rounded-full font-semibold transition-all";
const OUTLINE_CTA_CLS =
  "inline-flex items-center justify-center bg-transparent border border-white/10 hover:border-white/30 text-[#fafafa] rounded-full font-medium transition-all";

// --- SVGs ---

const LogoSVG = () => (
  <svg viewBox="0 0 100 100" fill="none" className="w-[26px] h-[26px]">
    <line x1="22" y1="22" x2="58" y2="22" stroke="#1FAE85" strokeWidth="3" strokeLinecap="round" />
    <line x1="78" y1="42" x2="78" y2="78" stroke="#1FAE85" strokeWidth="3" strokeLinecap="round" />
    <line x1="78" y1="78" x2="22" y2="78" stroke="#1FAE85" strokeWidth="3" strokeLinecap="round" />
    <line x1="22" y1="78" x2="22" y2="22" stroke="#1FAE85" strokeWidth="3" strokeLinecap="round" />
    <circle cx="22" cy="22" r="6" fill="#1FAE85" />
    <circle cx="78" cy="22" r="6" fill="none" stroke="#1FAE85" strokeWidth="3" />
    <circle cx="78" cy="78" r="6" fill="#1FAE85" />
    <circle cx="22" cy="78" r="6" fill="#1FAE85" />
  </svg>
);

const DiscordSVG = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

// --- Components ---

const Nav = () => (
  <nav className="sticky top-0 z-[100] flex items-center justify-between px-4 py-3 md:px-12 md:py-[14px] bg-[#09090b]/90 backdrop-blur-[20px] border-b border-white/5">
    <a href="/" className="flex items-center gap-[10px] text-[#fafafa] hover:opacity-90 transition-opacity">
      <LogoSVG />
      <span className="text-[17px] font-semibold tracking-[-0.02em]">SeldonFrame</span>
    </a>
    <div className="flex items-center gap-4 md:gap-7">
      <a href="/docs" className="hidden md:block text-[14px] text-[#a1a1aa] hover:text-[#fafafa] transition-colors">Docs</a>
      <a href="https://github.com/seldonframe/seldonframe" target="_blank" rel="noopener noreferrer" className="hidden md:block text-[14px] text-[#a1a1aa] hover:text-[#fafafa] transition-colors">GitHub</a>
      {/* Fix (d): /pricing → #pricing anchor on same page */}
      <a href="#pricing" className="hidden md:block text-[14px] text-[#a1a1aa] hover:text-[#fafafa] transition-colors">Pricing</a>
      <a href="/blog" className="hidden md:block text-[14px] text-[#a1a1aa] hover:text-[#fafafa] transition-colors">Blog</a>
      <a href="/#install" className={`${PRIMARY_CTA_CLS} px-[18px] py-2 text-[13px]`}>
        Install the MCP &rarr;
      </a>
    </div>
  </nav>
);

// v1.32.0 — Animated BuildAndShowCard. Replaces the v1.31.0
// AgentEvalCard. Hero animation now shows what customers actually
// want: a complete website + booking + intake + chatbot getting
// built from one Claude Code prompt, live, in front of their eyes.
//
// Two-pane layout:
//   LEFT  (38%): Claude Code terminal — user prompt + 4 tool calls
//                fire sequentially with green status pills, then
//                "✓ Live at acme-hvac.app.seldonframe.com" appears.
//   RIGHT (62%): Live website preview — sections appear in sync
//                with each tool call. Hero → booking calendar →
//                intake form → chatbot bubble pops in.
//
// Total animation ~6 seconds. Pure CSS+SVG — no images, theme-aware,
// fast, deploys instantly.
//
// Hormozi value equation hit:
//  - Dream Outcome: complete wired Business OS (visualized).
//  - Likelihood: shown working in <7 seconds.
//  - Time Delay: animation IS the proof of "under 5 min."
//  - Effort: one prompt builds everything.
const BuildAndShowCard = () => {
  const tools = [
    { name: "build_landing_page", delay: 1.5 },
    { name: "build_booking_page", delay: 2.5 },
    { name: "build_intake_form", delay: 3.5 },
    { name: "build_website_chatbot", delay: 4.5 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.95, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mt-14 mx-auto max-w-[1100px] grid md:grid-cols-[40%_60%] gap-3 md:gap-4"
    >
      {/* LEFT PANE: Claude Code terminal */}
      <div className="bg-[#0d0d10] border border-white/5 rounded-[12px] overflow-hidden shadow-[0_30px_80px_-30px_rgba(31,174,133,0.25),0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#161619] border-b border-white/5">
          <span className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
          <span className="w-[10px] h-[10px] rounded-full bg-[#ffbd2e]" />
          <span className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
          <span className="ml-2 font-mono text-[11px] text-[#71717a]">claude-code</span>
        </div>

        <div className="p-4 font-mono text-[12px] leading-[1.6] min-h-[420px]">
          {/* User prompt */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.35 }}
            className="text-[#fafafa] mb-4"
          >
            <span className="text-[#71717a]">&gt;</span>{" "}
            Build a client workspace
            <br />
            <span className="ml-3.5 text-[#a1a1aa]">for Acme HVAC. Phoenix, AZ.</span>
            <br />
            <span className="ml-3.5 text-[#a1a1aa]">AC repair and install.</span>
            <br />
            <span className="ml-3.5 text-[#a1a1aa]">Phone (602) 555-0188.</span>
          </motion.div>

          {/* Tool calls fire sequentially */}
          <div className="space-y-1.5">
            {tools.map((tool) => (
              <motion.div
                key={tool.name}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: tool.delay, duration: 0.3 }}
                className="flex items-center gap-2"
              >
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: tool.delay + 0.05, duration: 0.25, type: "spring", stiffness: 220 }}
                  className="text-[#1FAE85]"
                >
                  ●
                </motion.span>
                <span className="text-[11.5px] text-[#a1a1aa] truncate">{tool.name}</span>
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: tool.delay + 0.3, duration: 0.2 }}
                  className="ml-auto text-[10px] text-[#1FAE85] font-semibold"
                >
                  200 ok
                </motion.span>
              </motion.div>
            ))}
          </div>

          {/* Final live confirmation */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 5.4, duration: 0.4 }}
            className="mt-4 pt-3 border-t border-white/5"
          >
            <div className="flex items-start gap-2">
              <span className="text-[#1FAE85] shrink-0 mt-[1px]">✓</span>
              <div className="text-[11px]">
                <div className="text-[#fafafa] font-semibold">Live</div>
                <div className="text-[#1FAE85] break-all">acme-hvac.app.seldonframe.com</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* RIGHT PANE: Realistic admin dashboard preview (kanban + sidebar)
          v1.32.1 — Replaced the stylized landing-page mockup with a
          credible admin dashboard view. Same dark theme as the actual
          SF dashboard. Sidebar nav items light up green sequentially
          as build tools fire on the left pane. Pipeline kanban cards
          appear in columns as the workspace fills with data. Visual
          message: "this is real CRM software you can run a business
          on" — not a designer mockup. */}
      <div className="bg-[#0d0d10] border border-white/5 rounded-[12px] overflow-hidden shadow-[0_30px_80px_-30px_rgba(31,174,133,0.18),0_0_0_1px_rgba(255,255,255,0.02)]">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#161619] border-b border-white/5">
          <span className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
          <span className="w-[10px] h-[10px] rounded-full bg-[#ffbd2e]" />
          <span className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
          <div className="flex-1 ml-2 px-3 py-[3px] rounded bg-[#0d0d10] border border-white/5 font-mono text-[10.5px] text-[#71717a] truncate">
            app.seldonframe.com/dashboard
          </div>
        </div>

        {/* Dashboard body — sidebar + main content */}
        <div className="relative bg-[#0a0a0a] min-h-[420px] grid grid-cols-[34%_66%]">
          {/* SIDEBAR */}
          <div className="border-r border-white/5 p-2.5 space-y-3">
            {/* Workspace tile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.4 }}
              className="flex items-center gap-2 p-2 rounded-lg border border-white/5 bg-white/[0.02]"
            >
              <div className="size-6 rounded-md bg-gradient-to-br from-[#1FAE85] to-[#0e8364] flex items-center justify-center text-[#09090b] text-[10px] font-bold shrink-0">
                A
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-[#fafafa] truncate">Acme HVAC</div>
                <div className="text-[8px] text-[#71717a]">Active workspace</div>
              </div>
            </motion.div>

            {/* Nav groups */}
            <div className="space-y-2.5">
              <NavGroup label="OVERVIEW" delay={1.6}>
                <NavItem icon="dashboard" label="Dashboard" active />
              </NavGroup>

              <NavGroup label="RUN THE BUSINESS" delay={1.7}>
                <NavItem icon="users" label="Customers" />
                {/* These light up sequentially as tools fire */}
                <NavItem icon="calendar" label="Bookings" lightUpAt={2.5} />
                <NavItem icon="bot" label="Agents" lightUpAt={4.5} />
                <NavItem icon="layout" label="Pages" lightUpAt={1.5} />
                <NavItem icon="form" label="Intake Forms" lightUpAt={3.5} />
              </NavGroup>
            </div>
          </div>

          {/* MAIN CONTENT — Pipeline kanban */}
          <div className="p-3 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.4 }}
              className="flex items-center justify-between mb-3"
            >
              <div>
                <div className="text-[11px] font-semibold text-[#fafafa]">Pipeline</div>
                <div className="text-[9px] text-[#71717a]">Acme HVAC · Opportunities</div>
              </div>
              <span className="text-[9px] text-[#71717a] font-mono">⌘K</span>
            </motion.div>

            {/* Kanban columns */}
            <div className="grid grid-cols-4 gap-1.5">
              <KanbanColumn label="New Lead" color="#3b82f6" count={0} />
              <KanbanColumn
                label="Quoted"
                color="#a855f7"
                count={2}
                cards={[
                  { title: "AC repair", subtitle: "5012 N 32nd St", value: "$340", appearAt: 2.6 },
                  { title: "Furnace tune-up", subtitle: "Glendale", value: "$120", appearAt: 3.6 },
                ]}
              />
              <KanbanColumn
                label="Scheduled"
                color="#f59e0b"
                count={1}
                cards={[
                  { title: "AC install", subtitle: "May 10 · 2pm", value: "$4,800", appearAt: 4.6 },
                ]}
              />
              <KanbanColumn label="Won" color="#10b981" count={0} />
            </div>

            {/* Live chatbot indicator at the bottom */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 4.7, duration: 0.4 }}
              className="mt-3 flex items-center justify-between p-2 rounded-md border border-[#1FAE85]/20 bg-[#1FAE85]/[0.04]"
            >
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#1FAE85]" />
                <span className="text-[10px] text-[#fafafa] font-semibold">Acme HVAC Bot</span>
                <span className="text-[8px] text-[#71717a]">v1 · live</span>
              </div>
              <span className="text-[8px] text-[#1FAE85] font-mono">200 ok</span>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// v1.32.1 — Helper components for the dashboard mockup in
// BuildAndShowCard. Sidebar groups, nav items (with optional
// "lightUpAt" delay so they turn green as build tools fire),
// and kanban columns + cards (cards appear at staggered times).

const NavIcon = ({ kind }: { kind: string }) => {
  const stroke = "currentColor";
  const sw = "1.5";
  const common = { fill: "none", stroke, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" className="size-3" {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" className="size-3" {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" className="size-3" {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "bot":
      return (
        <svg viewBox="0 0 24 24" className="size-3" {...common}>
          <rect x="3" y="8" width="18" height="12" rx="2" />
          <circle cx="9" cy="14" r="1" />
          <circle cx="15" cy="14" r="1" />
          <path d="M12 4v4M8 4h8" />
        </svg>
      );
    case "layout":
      return (
        <svg viewBox="0 0 24 24" className="size-3" {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      );
    case "form":
      return (
        <svg viewBox="0 0 24 24" className="size-3" {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h4" />
        </svg>
      );
    default:
      return null;
  }
};

const NavGroup = ({
  label,
  children,
  delay = 1.6,
}: {
  label: string;
  children: React.ReactNode;
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay, duration: 0.35 }}
  >
    <div className="text-[7.5px] uppercase tracking-[0.12em] text-[#71717a] font-semibold mb-1 px-1.5">
      {label}
    </div>
    <div className="space-y-0.5">{children}</div>
  </motion.div>
);

const NavItem = ({
  icon,
  label,
  active,
  lightUpAt,
}: {
  icon: string;
  label: string;
  active?: boolean;
  /** seconds — when this nav item should "light up" green during the
   *  hero animation (matches when its corresponding build tool fires). */
  lightUpAt?: number;
}) => {
  const baseColor = active ? "text-[#fafafa]" : "text-[#a1a1aa]";
  return (
    <div
      className={`relative flex items-center gap-1.5 px-1.5 py-1 rounded text-[9.5px] ${
        active ? "bg-white/[0.04]" : ""
      } ${baseColor}`}
    >
      <NavIcon kind={icon} />
      <span className="truncate">{label}</span>
      {lightUpAt !== undefined && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: lightUpAt + 0.05, duration: 0.3, type: "spring", stiffness: 220 }}
          className="ml-auto size-1.5 rounded-full bg-[#1FAE85] shadow-[0_0_6px_rgba(31,174,133,0.6)]"
        />
      )}
    </div>
  );
};

type KanbanCard = {
  title: string;
  subtitle: string;
  value: string;
  /** seconds — when this card should appear */
  appearAt: number;
};

const KanbanColumn = ({
  label,
  color,
  count,
  cards = [],
}: {
  label: string;
  color: string;
  count: number;
  cards?: KanbanCard[];
}) => (
  <div className="rounded-md border border-white/5 bg-white/[0.015] p-1.5 min-h-[160px]">
    <div className="flex items-center gap-1 mb-1.5">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[8.5px] font-semibold text-[#fafafa] truncate">{label}</span>
      <span className="ml-auto text-[8.5px] text-[#71717a] font-mono">{count}</span>
    </div>
    <div className="space-y-1">
      {cards.map((card) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, scale: 0.92, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: card.appearAt, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded p-1.5 bg-[#0d0d10] border border-white/5"
        >
          <div className="text-[8.5px] font-semibold text-[#fafafa] truncate">{card.title}</div>
          <div className="text-[7.5px] text-[#71717a] truncate">{card.subtitle}</div>
          <div className="mt-1 inline-block text-[7.5px] font-mono text-[#1FAE85] bg-[#1FAE85]/10 border border-[#1FAE85]/20 rounded px-1 py-px">
            {card.value}
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

// v1.32.0 — Inline install command pill. Below the hero CTAs.
// One-click copy. Shows the exact command operators run in their
// terminal — Hormozi value equation: low effort, no abstraction.
const InstallCommandPill = () => {
  const command = "claude mcp add seldonframe -- npx -y @seldonframe/mcp";
  const [copied, setCopied] = React.useState(false);

  const onCopy = () => {
    navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.85, duration: 0.4 }}
      className="mt-6 inline-flex items-center gap-2.5 pl-4 pr-2 py-2 rounded-full bg-[#0d0d10] border border-white/10"
    >
      <span className="font-mono text-[11px] text-[#71717a]">$</span>
      <span className="font-mono text-[12px] text-[#fafafa] truncate max-w-[280px] sm:max-w-none">
        {command}
      </span>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy install command"
        className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-[10.5px] font-mono text-[#a1a1aa] hover:text-[#fafafa] transition-colors"
      >
        {copied ? (
          <>
            <svg viewBox="0 0 12 12" className="size-3 text-[#1FAE85]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.5l2.5 2.5L9.5 4" />
            </svg>
            copied
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            copy
          </>
        )}
      </button>
    </motion.div>
  );
};

const Hero = () => {
  const badges = ["Open Source", "MCP-native", "Claude Code ready"];

  return (
    <section className="relative text-center pt-[72px] pb-[64px] px-5 md:px-12 max-w-[1200px] mx-auto overflow-hidden">
      {/* Subtle radial glow behind the hero */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-[-100px] h-[500px] -z-10 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(31,174,133,0.18), transparent 70%)",
        }}
      />

      <div className="flex justify-center gap-3 mb-8 flex-wrap">
        {badges.map((text, i) => (
          <motion.div
            key={text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.4 }}
          >
            <Badge variant="outline" className="bg-[#1a1a1e] border-white/5 text-[#a1a1aa] font-mono text-[11px] tracking-[0.03em] px-3 py-[5px] rounded-full gap-1.5 flex items-center">
              <span className="w-[5px] h-[5px] rounded-full bg-[#1FAE85]" />
              {text}
            </Badge>
          </motion.div>
        ))}
      </div>

      {/* v1.45.0 — Agency-buyer repositioning (May 2026 brief).
          Headline reframes from operator-buyer ("your website") to
          agency-buyer ("deploy per client"). Subhead positions
          SeldonFrame as the open-source alternative to GoHighLevel
          and surfaces the "primitives, build anything" meta-
          differentiation (unlimited landing pages, agents, funnels,
          voice agents via Claude Code MCP). */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.55 }}
        className="text-[clamp(36px,5.5vw,64px)] font-bold tracking-[-0.04em] leading-[1.05] mb-5 max-w-[900px] mx-auto text-[#fafafa]"
      >
        CRM. Booking. Intake.{" "}
        <span className="text-[#1FAE85]">AI chatbot</span>.<br />
        Already wired. Deploy per client in 3 minutes.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
        className="text-[17px] text-[#a1a1aa] max-w-[720px] mx-auto mb-9 leading-[1.65] font-normal"
      >
        The open-source alternative to GoHighLevel. The consolidation
        GHL agencies love, without the complexity they hate. Generate
        a complete client ops stack from one Claude Code prompt in 3
        minutes — then build anything else on top: unlimited landing
        pages, intake forms, quiz funnels, AI agents, voice agents,
        SMS sequences. All via Claude Code. No coding, no Zapier, no
        feature requests waiting on a vendor.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75, duration: 0.5 }}
        className="flex justify-center gap-3 flex-wrap"
      >
        <a href="#install" className={`${PRIMARY_CTA_CLS} hover:-translate-y-[1px] px-[28px] py-3 text-[14px]`}>
          Install the MCP &rarr;
        </a>
        <a href="/demo" className={`${OUTLINE_CTA_CLS} px-[28px] py-3 text-[14px]`}>
          See a live build &#9654;
        </a>
      </motion.div>

      <InstallCommandPill />

      <BuildAndShowCard />
    </section>
  );
};

// v1.31.1 — "Show, don't tell" feature stories.
//
// Replaces the flat 6-up Features grid with 3 detailed feature stories
// alternating image-left / image-right. Each story has a small CSS+SVG
// product mockup beside body copy. Linear-style: pick a few features,
// show them in motion, link to the relevant doc.

// Story 1 visual — Claude Code prompt with MCP tool calls
const ClaudeCodeMockVisual = () => (
  <div className="relative bg-[#0d0d10] border border-white/5 rounded-[14px] overflow-hidden shadow-[0_30px_80px_-30px_rgba(31,174,133,0.18),0_0_0_1px_rgba(255,255,255,0.02)]">
    <div className="flex items-center gap-2 px-[14px] py-[10px] bg-[#161619] border-b border-white/5">
      <span className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
      <span className="w-[10px] h-[10px] rounded-full bg-[#ffbd2e]" />
      <span className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
      <span className="ml-2 font-mono text-[11px] text-[#71717a]">claude-code</span>
    </div>
    <div className="p-5 font-mono text-[12px] leading-[1.65]">
      <span className="text-[#71717a]">&gt;</span>{" "}
      <span className="text-[#fafafa]">Build a chatbot for Acme Dental that books cleanings.</span>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2 text-[#a1a1aa]">
          <span className="text-[#1FAE85]">●</span>
          <span>get_workspace_state</span>
          <span className="ml-auto text-[10px] text-[#1FAE85]">200 ok</span>
        </div>
        <div className="flex items-center gap-2 text-[#a1a1aa]">
          <span className="text-[#1FAE85]">●</span>
          <span>build_website_chatbot</span>
          <span className="ml-auto text-[10px] text-[#1FAE85]">200 ok</span>
        </div>
        <div className="flex items-center gap-2 text-[#a1a1aa]">
          <span className="text-[#1FAE85]">●</span>
          <span>run_agent_evals</span>
          <span className="ml-auto text-[10px] text-[#1FAE85]">8/8 passed</span>
        </div>
        <div className="flex items-center gap-2 text-[#a1a1aa]">
          <span className="text-[#1FAE85]">●</span>
          <span>publish_agent</span>
          <span className="ml-auto text-[10px] text-[#1FAE85]">live</span>
        </div>
      </div>
      <div className="mt-3 text-[#1FAE85]">
        ✓ Acme Dental Chatbot is live at acme-dental.app.seldonframe.com
      </div>
    </div>
  </div>
);

// v1.32.0 — Story 2 visual. Hub-and-spokes diagram: SF logo at center,
// 4 framework tiles (Website / Calendar / Forms / CRM) on the corners
// connected by faint teal lines. Visualizes Becker's "wired together
// frameworks with same branding" insight in one glance.
const WiredFrameworkVisual = () => {
  const tiles = [
    { label: "Website", x: "10%", y: "10%" },
    { label: "Calendar", x: "70%", y: "10%" },
    { label: "Forms", x: "10%", y: "70%" },
    { label: "CRM", x: "70%", y: "70%" },
  ];

  return (
    <div className="relative bg-[#0d0d10] border border-white/5 rounded-[14px] overflow-hidden shadow-[0_30px_80px_-30px_rgba(31,174,133,0.18),0_0_0_1px_rgba(255,255,255,0.02)] aspect-[4/3]">
      {/* Connecting lines (SVG positioned absolutely) */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="none">
        <defs>
          <linearGradient id="line-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1FAE85" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1FAE85" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {/* 4 lines from each corner tile to center */}
        <line x1="80" y1="60" x2="200" y2="150" stroke="url(#line-gradient)" strokeWidth="1.2" strokeDasharray="3 3" />
        <line x1="320" y1="60" x2="200" y2="150" stroke="url(#line-gradient)" strokeWidth="1.2" strokeDasharray="3 3" />
        <line x1="80" y1="240" x2="200" y2="150" stroke="url(#line-gradient)" strokeWidth="1.2" strokeDasharray="3 3" />
        <line x1="320" y1="240" x2="200" y2="150" stroke="url(#line-gradient)" strokeWidth="1.2" strokeDasharray="3 3" />
      </svg>

      {/* Center: SF logo + one-workspace label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-[12px] bg-gradient-to-br from-[#1FAE85]/20 to-transparent border border-[#1FAE85]/30 shadow-[0_0_30px_-5px_rgba(31,174,133,0.5)]">
          <div className="size-8 rounded-[8px] bg-gradient-to-br from-[#1FAE85] to-[#0e8364] flex items-center justify-center text-[#09090b] text-[14px] font-bold">
            SF
          </div>
          <div className="text-[10px] font-mono text-[#a1a1aa] uppercase tracking-[0.05em]">
            One workspace
          </div>
        </div>
      </div>

      {/* 4 framework tiles in corners */}
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="absolute w-[20%] aspect-square flex flex-col items-center justify-center gap-1 rounded-[10px] bg-[#0a0a0a] border border-white/10"
          style={{ left: tile.x, top: tile.y }}
        >
          <span className="size-1.5 rounded-full bg-[#1FAE85]" />
          <span className="text-[10px] font-mono text-[#a1a1aa]">{tile.label}</span>
        </div>
      ))}

      {/* Bottom caption */}
      <div className="absolute bottom-3 left-0 right-0 text-center">
        <span className="text-[10px] font-mono text-[#71717a]">
          Same database · Same brand · Same admin
        </span>
      </div>
    </div>
  );
};

// v1.32.0 — Story 3 visual. Mini "edit by typing" mockup. Shows a
// follow-up prompt to Claude Code (raise prices, add a service area,
// tweak a chatbot answer) → 3 small tool calls fire → "✓ Updated."
// Carries the "edge cases are a feature, not a fight" message.
const EditAnythingVisual = () => (
  <div className="bg-[#0d0d10] border border-white/5 rounded-[14px] overflow-hidden shadow-[0_30px_80px_-30px_rgba(31,174,133,0.18),0_0_0_1px_rgba(255,255,255,0.02)]">
    <div className="flex items-center gap-2 px-[14px] py-[10px] bg-[#161619] border-b border-white/5">
      <span className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
      <span className="w-[10px] h-[10px] rounded-full bg-[#ffbd2e]" />
      <span className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
      <span className="ml-2 font-mono text-[11px] text-[#71717a]">claude-code</span>
    </div>
    <div className="p-5 font-mono text-[12px] leading-[1.65]">
      <div className="text-[#fafafa] mb-4">
        <span className="text-[#71717a]">&gt;</span>{" "}
        Raise the AC repair price from{" "}
        <span className="text-[#a1a1aa]">$89 to $99</span>.
        <br />
        <span className="ml-3.5 text-[#a1a1aa]">Add &quot;Glendale&quot; to service areas.</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[#a1a1aa]">
          <span className="text-[#1FAE85]">●</span>
          <span className="text-[11.5px]">update_agent_pricing</span>
          <span className="ml-auto text-[10px] text-[#1FAE85] font-semibold">200 ok</span>
        </div>
        <div className="flex items-center gap-2 text-[#a1a1aa]">
          <span className="text-[#1FAE85]">●</span>
          <span className="text-[11.5px]">update_landing_page</span>
          <span className="ml-auto text-[10px] text-[#1FAE85] font-semibold">200 ok</span>
        </div>
        <div className="flex items-center gap-2 text-[#a1a1aa]">
          <span className="text-[#1FAE85]">●</span>
          <span className="text-[11.5px]">run_agent_evals</span>
          <span className="ml-auto text-[10px] text-[#1FAE85] font-semibold">8/8 passed</span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
        <span className="text-[#1FAE85]">✓</span>
        <span className="text-[11px] text-[#fafafa] font-semibold">Updated</span>
        <span className="text-[10px] text-[#71717a] font-mono ml-auto">v3 → v4 · live</span>
      </div>
    </div>
  </div>
);

const FeatureStory = ({
  visual,
  pill,
  title,
  body,
  ctaLabel,
  ctaHref,
  reverse,
  index,
}: {
  visual: React.ReactNode;
  pill: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  reverse?: boolean;
  index: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    className={`grid md:grid-cols-2 gap-8 md:gap-14 items-center ${index > 0 ? "mt-20 md:mt-32" : ""}`}
  >
    <div className={`order-1 ${reverse ? "md:order-2" : "md:order-1"}`}>
      <span className="inline-block px-2.5 py-1 rounded-full bg-[#1FAE85]/10 border border-[#1FAE85]/20 text-[#1FAE85] font-mono text-[10.5px] tracking-[0.05em] uppercase mb-4">
        {pill}
      </span>
      <h3 className="text-[clamp(24px,3vw,34px)] font-bold tracking-[-0.025em] leading-[1.1] mb-4 text-[#fafafa]">
        {title}
      </h3>
      <p className="text-[15px] text-[#a1a1aa] leading-[1.7] mb-6">{body}</p>
      <a
        href={ctaHref}
        className="inline-flex items-center gap-1.5 text-[14px] text-[#1FAE85] font-semibold hover:gap-2 transition-all"
      >
        {ctaLabel}
        <span>&rarr;</span>
      </a>
    </div>
    <div className={`order-2 ${reverse ? "md:order-1" : "md:order-2"}`}>{visual}</div>
  </motion.div>
);

// v1.32.0 — FeatureStories rewritten. Becker framework insight:
// customers want frameworks (CRM + landing page + calendar + intake)
// wired together with one brand, fully customizable by saying what
// to change, no Zapier breaking. Three stories below frame this:
//   1. Type, don't click. (Build with Claude Code)
//   2. Wired. No Zapier. (Frameworks all linked, one brand)
//   3. Edit anything by saying so. (Customize edge cases)
const FeatureStories = () => (
  <section className="py-[80px] md:py-[120px] px-5 md:px-12 max-w-[1180px] mx-auto">
    <div className="text-center mb-16 md:mb-20">
      <h2 className="text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.035em] leading-[1.1] mb-4 text-[#fafafa]">
        Why agencies deploy faster on SeldonFrame
      </h2>
      <p className="text-[16px] text-[#a1a1aa] max-w-[680px] mx-auto leading-[1.65]">
        GoHighLevel takes days per client to configure. Webflow +
        Calendly + HubSpot + Zapier takes weeks to stitch and breaks
        on schedule. SeldonFrame gives you wired-by-default
        frameworks — landing pages, CRM, booking, intake, agents —
        generated per client in minutes. Customizable to any edge
        case in natural language. No coding.
      </p>
    </div>

    <FeatureStory
      index={0}
      pill="Type, don't click"
      title="One prompt. The full client stack built."
      body="SeldonFrame gives Claude Code a typed tool surface for everything an agency ships per client — landing pages, booking, intake forms, CRM, AI agents. Describe the client's business. The workspace generates. Tell it to change something. It changes. No drag-and-drop. No setup wizard. No three-hour client kickoff."
      ctaLabel="See the install command"
      ctaHref="#install"
      visual={<ClaudeCodeMockVisual />}
    />

    <FeatureStory
      index={1}
      pill="Wired. No Zapier"
      title="Every client's stack shares one brain."
      body="The client's landing page knows their CRM. Their CRM knows their bookings. Their bookings know their AI chatbot. One database per client. One brand per client. One admin. When something breaks in a Zapier-stitched stack, the client calls you. Here, nothing's stitched — so nothing breaks."
      ctaLabel="See what's included"
      ctaHref="/docs/getting-started/what-is-seldonframe"
      reverse
      visual={<WiredFrameworkVisual />}
    />

    <FeatureStory
      index={2}
      pill="Unlimited customization"
      title="Every client edge case, one prompt away."
      body="Add a service area to a roofer client. Spin up a second intake form for a dental client's whitening promo. Build a new landing page for an HVAC client's seasonal AC campaign. Ship a specialized chatbot for a salon client's stylist booking. Unlimited intake forms, landing pages, and AI agents per client — all via Claude Code, no coding. SeldonFrame ships the change AND runs safety checks on anything the client's customers will see."
      ctaLabel="How updates work"
      ctaHref="/docs/agents/update-agent"
      visual={<EditAnythingVisual />}
    />
  </section>
);

// v1.32.0 — HowItWorks rewritten for Becker frameworks language +
// 12yo reading level + Hormozi value equation. Three concrete steps,
// each with the actual command/prompt. Step 1 lands at id="install"
// so the hero CTA "Install the MCP →" scrolls here.
const HowItWorks = () => {
  const steps = [
    {
      title: "Install in Claude Code",
      desc: "One command. One time. SeldonFrame plugs into Claude Code through MCP — no extra app to download, no config to fill in.",
      code: "claude mcp add seldonframe -- npx -y @seldonframe/mcp",
    },
    {
      title: "Describe your client",
      desc: "One sentence in Claude Code. Client name, what they do, their phone, their services. SeldonFrame detects the vertical, picks the right archetype, handles the rest.",
      code: "> Build a client workspace for Acme HVAC. Phoenix, AZ. AC repair and install. Phone (602) 555-0188.",
    },
    {
      title: "Ship the wired client workspace",
      desc: "Landing page, booking calendar, intake form, CRM, and an AI chatbot that books real appointments — all live, all linked, branded as the client. Customize edge cases in natural language. Hand off to the client.",
      code: "✓ Live at acme-hvac.app.seldonframe.com",
    },
  ];

  return (
    <section id="install" className="text-center py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1180px] mx-auto scroll-mt-20">
      <h2 className="text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.035em] leading-[1.1] mb-4 text-[#fafafa]">
        Three steps. Three minutes per client.
      </h2>
      <p className="text-[16px] text-[#a1a1aa] max-w-[600px] mx-auto mb-12 leading-[1.65]">
        No drag-and-drop. No setup wizards. No multi-day client
        onboarding. Describe the client; SeldonFrame ships their
        wired workspace.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: i * 0.15, duration: 0.5 }}
            className="relative"
          >
            <Card className="bg-[#111113] border-white/5 p-6 md:p-7 text-left rounded-[12px] h-full relative overflow-hidden">
              <span className="absolute top-3 right-4 text-[44px] font-extrabold text-[#1FAE85] opacity-15 tracking-[-0.04em] leading-none">
                {i + 1}
              </span>
              <h3 className="text-[15px] font-semibold mb-2 text-[#fafafa] relative z-10">{step.title}</h3>
              <p className="text-[13px] text-[#a1a1aa] leading-[1.6] relative z-10">{step.desc}</p>
              <code className="block mt-3 p-3 bg-[#1a1a1e] rounded-[8px] font-mono text-[11.5px] text-[#1FAE85] overflow-x-auto leading-[1.5] relative z-10 whitespace-pre-wrap break-words">
                {step.code}
              </code>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// v1.31.3 — Replaced the centered CTA-card "See it built" with a
// two-column case study: narrative on the left, stat-grid on the
// right. Frames the Desert Cool HVAC fixture honestly as a worked
// example (not a fabricated customer) so credibility holds.
const CaseStudy = () => (
  <section className="py-[80px] md:py-[120px] px-5 md:px-12 max-w-[1180px] mx-auto">
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="grid md:grid-cols-2 gap-8 md:gap-14 items-center"
    >
      <div>
        <span className="inline-block px-2.5 py-1 rounded-full bg-[#1FAE85]/10 border border-[#1FAE85]/20 text-[#1FAE85] font-mono text-[10.5px] tracking-[0.05em] uppercase mb-4">
          Worked example
        </span>
        <h2 className="text-[clamp(28px,3.5vw,40px)] font-bold tracking-[-0.03em] leading-[1.1] mb-5 text-[#fafafa]">
          What 3 minutes of client deployment looks like
        </h2>
        <p className="text-[15px] text-[#a1a1aa] leading-[1.7] mb-4">
          Desert Cool HVAC. Phoenix, AZ. A residential HVAC contractor
          with 14 technicians and ~1,800 customers — typical mid-market
          agency client. Their previous agency stack: Salesforce +
          Cal.com + Mailchimp + Intercom + Webflow, stitched with
          Zapier. Days to deploy. Brittle to maintain.
        </p>
        <p className="text-[15px] text-[#a1a1aa] leading-[1.7] mb-6">
          We deployed the SeldonFrame replacement on camera in 3
          minutes: branded landing page, booking system in the right
          timezone, intake form with HVAC-specific fields, CRM with
          HVAC pipeline stages, and a published chatbot that books
          diagnostic visits. Every prompt is in the walkthrough; every
          step works the same the next time your agency onboards a
          client.
        </p>
        <a href="/demo" className={`${PRIMARY_CTA_CLS} px-6 py-3 text-[14px] hover:-translate-y-[1px]`}>
          Watch the walkthrough &rarr;
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { stat: "3 min", label: "client to live" },
          { stat: "5 → 1", label: "tools replaced" },
          { stat: "8/8", label: "evals passed" },
          { stat: "0", label: "lines hand-edited" },
        ].map((tile, i) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
            className="rounded-[12px] border border-white/5 bg-[#0d0d10] p-5 md:p-6 hover:border-[#1FAE85]/30 transition-colors"
          >
            <div className="text-[clamp(28px,3vw,40px)] font-bold tracking-[-0.03em] text-[#fafafa] mb-1 leading-none">
              {tile.stat}
            </div>
            <div className="text-[12px] text-[#71717a] font-mono tracking-[0.02em]">
              {tile.label}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  </section>
);

// v1.31.3 — "Replaces" comparison row. Visual story for the
// consolidation pitch: 5 generic tool tiles (the categories SF replaces
// — CRM, scheduler, email, chatbot, builder) on the left, an arrow,
// then the SF wordmark on the right. We use category labels rather
// than competitor brand wordmarks to avoid trademark risks; the
// shape of the comparison is what carries the message.
const Replaces = () => {
  const tools = [
    { label: "CRM", icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )},
    { label: "Scheduler", icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    )},
    { label: "Email tool", icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-10 5L2 7" />
      </svg>
    )},
    { label: "Chatbot", icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    )},
    { label: "Site builder", icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    )},
  ];

  return (
    <section className="py-[60px] md:py-[80px] px-5 md:px-12 max-w-[1180px] mx-auto">
      <div className="text-center mb-10 md:mb-14">
        <h2 className="text-[clamp(24px,3vw,34px)] font-bold tracking-[-0.03em] leading-[1.15] mb-3 text-[#fafafa]">
          Replaces the stack agencies duct-tape for every client
        </h2>
        <p className="text-[15px] text-[#a1a1aa] max-w-[640px] mx-auto leading-[1.65]">
          Five vendors per client → one SeldonFrame workspace per
          client. Same database. Same brand. Same admin. And every
          agent your client needs — missed-call text back, review
          requests, voice callbacks, lead nurture — buildable in
          minutes from primitives.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8"
      >
        {/* Left side: 5 dimmed tool tiles in a grid */}
        <div className="grid grid-cols-5 gap-2 md:gap-3 max-w-[480px]">
          {tools.map((tool, i) => (
            <motion.div
              key={tool.label}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="relative flex flex-col items-center gap-2 p-3 rounded-[10px] border border-white/5 bg-[#0d0d10]"
            >
              {/* Diagonal strikethrough */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-[10px] pointer-events-none overflow-hidden"
              >
                <span className="absolute top-1/2 left-[-10%] w-[120%] h-px bg-[#71717a] rotate-[-20deg] origin-center opacity-50" />
              </span>
              <span className="text-[#71717a]">{tool.icon}</span>
              <span className="text-[10.5px] text-[#71717a] font-mono tracking-[0.02em]">
                {tool.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Arrow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="text-[#1FAE85]"
        >
          <svg viewBox="0 0 24 24" className="size-7 md:size-8 rotate-90 md:rotate-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </motion.div>

        {/* Right side: SF tile, prominent */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="flex flex-col items-center gap-2.5 px-7 py-5 rounded-[12px] border border-[#1FAE85]/40 bg-gradient-to-br from-[#1FAE85]/10 to-transparent shadow-[0_0_40px_-10px_rgba(31,174,133,0.4)]"
        >
          <LogoSVG />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#fafafa]">
            SeldonFrame
          </span>
        </motion.div>
      </motion.div>
    </section>
  );
};

const Pricing = () => {
  // April 30, 2026 — usage-based pricing migration. Tiers are
  // Free / Growth / Scale (no per-workspace charge — Growth caps at 3,
  // Scale unlimited).
  const tiers = [
    {
      name: "Free", badgeColor: "bg-[#222226] text-[#a1a1aa]", price: "$0",
      workspaceCaption: "1 client workspace · free forever",
      features: ["1 client workspace", "50 contacts", "100 agent runs / mo", "All core blocks", "BYO LLM keys", "Community support"],
    },
    {
      name: "Growth", badgeColor: "bg-[#1FAE85]/12 text-[#1FAE85]", price: "$29/mo + usage", isFeatured: true,
      workspaceCaption: "3 client workspaces included",
      features: ["3 client workspaces", "500 contacts + 1,000 runs included", "$0.02/contact + $0.03/run beyond", "Custom domain per client", "Remove SeldonFrame branding", "Client portal · email support"],
    },
    {
      name: "Scale", badgeColor: "bg-[#e84393]/10 text-[#e84393]", price: "$99/mo + usage",
      workspaceCaption: "Unlimited client workspaces · full white-label SaaS",
      features: ["Unlimited client workspaces", "Agent runs $0.02 each", "Full white-label SaaS reselling", "Per-client branded portal", "Brain Layer 2", "Priority support"],
    },
  ];

  return (
    <section id="pricing" className="text-center py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1140px] mx-auto">
      <h2 className="text-[clamp(26px,3.5vw,38px)] font-bold tracking-[-0.03em] mb-[10px] text-[#fafafa]">Simple pricing. You own the rest.</h2>
      <p className="text-[16px] text-[#a1a1aa] max-w-[560px] mx-auto mb-3">
        Open source. Self-host for free. Hosted tiers scale with your usage — pay only for what you use.
      </p>
      <div className="text-[14px] text-[#1FAE85] font-semibold mb-11">Your first client workspace is always free.</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((t, i) => (
          <motion.div
            key={t.name}
            // Fix (c): removed scale: 1.02 on featured tier (teal border is enough)
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: i * 0.2, duration: 0.5 }}
            className={`h-full ${t.isFeatured ? "z-10 relative" : ""}`}
          >
            <Card className={`bg-[#111113] p-6 md:p-8 text-left rounded-[12px] h-full ${t.isFeatured ? "border-[#1FAE85]" : "border-white/5"}`}>
              <span className={`inline-block px-[10px] py-[3px] rounded-full text-[11px] font-semibold tracking-[0.05em] uppercase mb-[14px] font-mono ${t.badgeColor}`}>
                {t.name}
              </span>
              <div className="text-[40px] font-bold tracking-[-0.04em] mb-[2px] text-[#fafafa] leading-none">{t.price}</div>
              {/* April 30, 2026 — usage-based pricing migration. The new
                  model has NO per-workspace charge: Free=1, Growth=3,
                  Scale=unlimited. Caption now shows the per-tier
                  workspace allowance instead of "per workspace / month". */}
              <div className="text-[13px] text-[#71717a] mb-[22px]">{t.workspaceCaption}</div>
              <ul className="m-0 p-0 list-none">
                {t.features.map((feat) => (
                  <li key={feat} className="text-[13px] text-[#a1a1aa] py-[7px] border-t border-white/5 flex items-start gap-2 leading-[1.5]">
                    <span className="text-[#1FAE85] text-[12px] font-bold mt-[1px] shrink-0">✓</span>
                    {feat}
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Fix (f): BYO note reframed (no concrete dollar claims for current archetypes) */}
      <div className="mt-10 p-6 md:px-[28px] md:py-[22px] bg-[#111113] border border-white/5 rounded-[12px] text-left max-w-[660px] mx-auto">
        <h4 className="text-[14px] font-semibold mb-[6px] text-[#fafafa]">You bring your own LLM keys. We don&apos;t margin on tokens.</h4>
        <p className="text-[13px] text-[#a1a1aa] leading-[1.65]">
          SeldonFrame connects to your Anthropic or OpenAI account directly. Per-run costs are visible in your admin dashboard. Every LLM call is tracked, attributed to the workflow run, and displayed alongside your agent traces.
        </p>
      </div>
    </section>
  );
};

const Infrastructure = () => {
  const logos = ["Twilio", "Resend", "Stripe", "Anthropic", "OpenAI"];

  return (
    <section className="text-center py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1140px] mx-auto">
      <h2 className="text-[clamp(26px,3.5vw,38px)] font-bold tracking-[-0.03em] mb-4 text-[#fafafa]">Plugs into the infrastructure you&apos;d never rebuild</h2>
      <p className="text-[16px] text-[#a1a1aa] max-w-[600px] mx-auto mb-10">
        The hard parts — SMS, email, payments, LLM inference — stay with the companies that earned the right to do them well. Your data stays yours.
      </p>
      <div className="flex justify-center items-center gap-4 flex-wrap">
        {logos.map((logo, i) => (
          <motion.span
            key={logo}
            animate={{ y: [-4, 4, -4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
            className="font-mono text-[13px] text-[#a1a1aa] px-[18px] py-[10px] border border-white/5 rounded-[8px] bg-[#111113]"
          >
            {logo}
          </motion.span>
        ))}
      </div>
      <div className="mt-8">
        <a href="/docs" className="text-[14px] text-[#1FAE85] hover:underline">
          → The full MCP tool surface your agent can call
        </a>
      </div>
    </section>
  );
};

// v1.45.0 — WhyGHLAgenciesSwitch — agency-buyer love/hate split.
// Direct emotional rewire: surfaces the GHL pain points (steep
// learning curve, complicated mess at scale, UI lag) alongside what
// SeldonFrame keeps from the GHL value proposition (consolidation,
// recurring-revenue agency model, white-label resale).
const WhyGHLAgenciesSwitch = () => {
  const keeps = [
    "Consolidation — one platform, not five",
    "Recurring-revenue agency model",
    "Standardized delivery across clients",
    "White-label SaaS reselling (Scale tier)",
  ];
  const drops = [
    "Steep learning curve",
    '"Complicated mess" at scale',
    "UI lag, inconsistent reliability",
    "Days-to-weeks per-client setup",
    "$97-$497/mo before white-label add-ons",
  ];

  return (
    <section className="py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1100px] mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.035em] leading-[1.1] mb-3 text-[#fafafa]">
          Why agencies switch from GoHighLevel
        </h2>
        <p className="text-[16px] text-[#a1a1aa] max-w-[620px] mx-auto leading-[1.65]">
          The consolidation GHL agencies love. Without the complexity
          they hate.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="bg-[#0d0d10] border border-[#1FAE85]/30 rounded-[12px] p-6 md:p-8"
        >
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#1FAE85] mb-4">
            What SeldonFrame keeps
          </div>
          <ul className="space-y-3">
            {keeps.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[14px] text-[#fafafa] leading-[1.55]">
                <span className="text-[#1FAE85] font-bold mt-[2px] shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-[#0d0d10] border border-white/10 rounded-[12px] p-6 md:p-8"
        >
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#a1a1aa] mb-4">
            What SeldonFrame doesn&apos;t reproduce
          </div>
          <ul className="space-y-3">
            {drops.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[14px] text-[#a1a1aa] leading-[1.55]">
                <span className="text-[#71717a] font-bold mt-[2px] shrink-0">✗</span>
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
};

// v1.45.0 — BuildFromPrimitives — surfaces the meta-positioning.
// Every feature GHL ships as a one-size template, SeldonFrame ships
// as a Claude Code primitive. Agencies build per-client agents in
// minutes from these primitives. Customization is the product.
const BuildFromPrimitives = () => {
  const capabilities = [
    {
      title: "Missed-call text back",
      body: "Build per client. HVAC emergency-aware vs dental insurance-pre-qual vs salon stylist-preference capture.",
    },
    {
      title: "Review-request automation",
      body: "Post-completed-job SMS or email with the client's Google review link. Per-vertical timing logic.",
    },
    {
      title: "Speed-to-lead agent",
      body: "Inbound lead → response within seconds. Vertical-tuned qualifying questions, SMS + email + voice handoff.",
    },
    {
      title: "Voice agent",
      body: "Twilio + LiveKit + OpenAI Realtime. BYO keys; we orchestrate the agent via MCP. Per-client voice persona.",
    },
    {
      title: "Quiz funnels",
      body: "5-step lead-quiz funnel for a medspa client's botox-readiness check. Or a dental insurance eligibility quiz.",
    },
    {
      title: "Multi-touch sequences",
      body: "7-30 day SMS + email nurture flows. Vertical-aware copy. Conditional branching via natural-language rules.",
    },
  ];

  return (
    <section className="py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1180px] mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.035em] leading-[1.1] mb-3 text-[#fafafa]">
          Build anything on top of the stack
        </h2>
        <p className="text-[16px] text-[#a1a1aa] max-w-[680px] mx-auto leading-[1.65]">
          Every feature GHL ships as a one-size template, SeldonFrame
          ships as a Claude Code primitive. Build it per client, in
          minutes, no coding. BYO Twilio, OpenAI, Anthropic.
          $0.02 per agent turn.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {capabilities.map((cap, i) => (
          <motion.div
            key={cap.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            className="bg-[#0d0d10] border border-white/5 rounded-[10px] p-5 hover:border-[#1FAE85]/30 transition-colors"
          >
            <h3 className="text-[15px] font-semibold text-[#fafafa] mb-2 tracking-[-0.01em]">
              {cap.title}
            </h3>
            <p className="text-[13px] text-[#a1a1aa] leading-[1.6]">{cap.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// v1.45.0 — RedditProof — paraphrased Reddit pain points from
// r/gohighlevel + r/agency (May 2026), surfaced as honest agency
// trust signals. Anchors the comparison in real-world evidence vs
// abstract marketing claims.
const RedditProof = () => (
  <section className="py-[40px] md:py-[60px] px-5 md:px-12 max-w-[980px] mx-auto">
    <div className="grid md:grid-cols-2 gap-4">
      <motion.blockquote
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="bg-[#0d0d10] border border-white/5 rounded-[10px] p-5 md:p-6"
      >
        <p className="text-[14px] text-[#fafafa] leading-[1.6] mb-3">
          &ldquo;GHL became a complicated mess. The learning curve is
          real. Tutorials are not great.&rdquo;
        </p>
        <footer className="text-[11px] font-mono text-[#71717a] uppercase tracking-[0.05em]">
          paraphrased from r/gohighlevel, May 2026
        </footer>
      </motion.blockquote>

      <motion.blockquote
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-[#0d0d10] border border-white/5 rounded-[10px] p-5 md:p-6"
      >
        <p className="text-[14px] text-[#fafafa] leading-[1.6] mb-3">
          &ldquo;8 of 8 Zapier zaps broke in 2 weeks. Two weeks of
          leads to manually recover.&rdquo;
        </p>
        <footer className="text-[11px] font-mono text-[#71717a] uppercase tracking-[0.05em]">
          paraphrased from r/agency, May 2026
        </footer>
      </motion.blockquote>
    </div>
  </section>
);

// v1.45.0 — Roadmap — Q3 / Q4 2026 ship list. Honest transparency
// on what's not yet shipped. Reduces objection-handling on sales
// calls; signals momentum.
const Roadmap = () => {
  const q3 = [
    "Missed-call text back recipe (Twilio webhook + skill pack)",
    "Review-request automation recipe (post-job SMS/email)",
    "Speed-to-lead agent recipe",
    "Multi-touch SMS/email sequence primitive",
    "Voice agent (Twilio + LiveKit + OpenAI Realtime, BYOK)",
  ];
  const q4 = [
    "Marketplace: agencies sell skill packs to other agencies (revenue share)",
    "Vertical skill-pack library (HVAC, dental, real-estate deeper logic)",
    "Voice agent setup wizard (one-command BYOK telco configuration)",
    "Branded mobile app option",
  ];

  return (
    <section className="py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1100px] mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.035em] leading-[1.1] mb-3 text-[#fafafa]">
          Roadmap
        </h2>
        <p className="text-[16px] text-[#a1a1aa] max-w-[620px] mx-auto leading-[1.65]">
          What&apos;s shipping next. Build along with us — every recipe
          ships as an open-source skill pack you can fork or extend.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="bg-[#0d0d10] border border-white/5 rounded-[12px] p-6 md:p-7"
        >
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#1FAE85] mb-4">
            Shipping Q3 2026
          </div>
          <ul className="space-y-2.5">
            {q3.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[13.5px] text-[#a1a1aa] leading-[1.55]">
                <span className="text-[#1FAE85] mt-[2px] shrink-0">→</span>
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-[#0d0d10] border border-white/5 rounded-[12px] p-6 md:p-7"
        >
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#a1a1aa] mb-4">
            Shipping Q4 2026
          </div>
          <ul className="space-y-2.5">
            {q4.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[13.5px] text-[#a1a1aa] leading-[1.55]">
                <span className="text-[#71717a] mt-[2px] shrink-0">→</span>
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
};

// v1.32.0 — FinalCTA rewritten for the install-MCP funnel + 12yo
// language. v1.45.0 — agency-buyer emotional rewire ("build the
// agency you wanted to build").
const FinalCTA = () => (
  <section className="text-center py-[80px] px-5 md:px-12 border-t border-white/5 max-w-[1180px] mx-auto">
    <h2 className="text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.035em] leading-[1.1] mb-4 text-[#fafafa]">
      Build the agency you wanted to build.
    </h2>
    <p className="text-[16px] text-[#a1a1aa] max-w-[640px] mx-auto mb-8 leading-[1.65]">
      GHL ships templates. SeldonFrame ships primitives. Your agency
      builds anything per client — landing pages, agents, voice
      callbacks, sequences, funnels — via Claude Code in minutes.
      Sell your best work in the marketplace (shipping Q4 2026).
      Open source. AGPL-3.0. $0.02 per agent turn.
    </p>
    <div className="flex justify-center gap-3 flex-wrap">
      <a href="#install" className={`${PRIMARY_CTA_CLS} hover:-translate-y-[1px] px-[26px] py-3 text-[14px]`}>
        Install the MCP &rarr;
      </a>
      <a href="/docs" className={`${OUTLINE_CTA_CLS} px-[26px] py-3 text-[14px]`}>
        Read the docs
      </a>
    </div>
  </section>
);

// Fix (a): Footer hrefs replaced with real paths.
const Footer = () => {
  const links: Array<{ label: string; href: string; external?: boolean }> = [
    { label: "GitHub", href: "https://github.com/seldonframe/seldonframe", external: true },
    { label: "Docs", href: "/docs" },
    { label: "Discord", href: "https://discord.gg/sbVUu976NW", external: true },
    { label: "𝕏", href: "https://x.com/seldonframe", external: true },
    { label: "Blog", href: "/blog" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ];

  return (
    <footer className="py-9 px-12 text-center border-t border-white/5">
      <div className="flex justify-center gap-6 mb-4 flex-wrap">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noopener noreferrer" : undefined}
            className="text-[13px] text-[#71717a] hover:text-[#fafafa] transition-colors"
          >
            {link.label}
          </a>
        ))}
      </div>
      <div className="text-[11px] text-[#3f3f46]">
        © 2026 SeldonFrame. Open source under AGPL-3.0.
      </div>
    </footer>
  );
};

const DiscordFloat = () => (
  <motion.a
    href="https://discord.gg/sbVUu976NW"
    target="_blank"
    rel="noopener noreferrer"
    initial={{ opacity: 0, x: 50 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: 2, duration: 0.5, type: "spring", stiffness: 100 }}
    className="fixed bottom-5 right-5 z-[90] flex items-center gap-[7px] px-4 py-[9px] rounded-full bg-[#5865F2] text-white text-[13px] font-semibold shadow-[0_6px_28px_rgba(0,0,0,0.45)] hover:-translate-y-[2px] transition-transform"
  >
    <DiscordSVG />
    Discord
  </motion.a>
);

export default function SeldonFrameLandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] font-sans antialiased selection:bg-[#1FAE85]/20">
      <Nav />
      <main>
        <Hero />
        {/* v1.45.0 — agency-buyer love/hate split inserted before
            FeatureStories to anchor the emotional comparison early.
            Quotes the GoHighLevel pain points the page rewires
            against. */}
        <WhyGHLAgenciesSwitch />
        {/* v1.31.1 — three "show, don't tell" feature stories
            alternating image-left/right. v1.45.0 — body copy
            rewritten for agency-buyer ("client" not "your business")
            and Story 3 surfaces the "unlimited customization per
            client" framing. */}
        <FeatureStories />
        {/* v1.45.0 — BuildFromPrimitives surfaces the meta-positioning
            (primitives, not features) with 6 concrete capability
            cards (missed-call, reviews, speed-to-lead, voice, quiz
            funnels, sequences). BYOK + $0.02/turn called out. */}
        <BuildFromPrimitives />
        <HowItWorks />
        {/* v1.45.0 — Reddit-paraphrased proof quotes above the
            CaseStudy. Anchors comparison in real-world evidence. */}
        <RedditProof />
        {/* v1.31.3 — Desert Cool HVAC worked example. v1.45.0 —
            reframed from operator-buyer to agency-buyer (the agency
            deploys for the client; the previous stack was the
            agency's, not the operator's). */}
        <CaseStudy />
        <Replaces />
        <Pricing />
        {/* v1.45.0 — Roadmap section, Q3/Q4 2026 ships. Honest
            transparency on what's not yet shipped. */}
        <Roadmap />
        <Infrastructure />
        <FinalCTA />
      </main>
      <Footer />
      <DiscordFloat />
    </div>
  );
}
