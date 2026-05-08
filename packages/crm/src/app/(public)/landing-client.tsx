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
      <a href="/signup" className={`${PRIMARY_CTA_CLS} px-[18px] py-2 text-[13px]`}>
        Start for free &rarr;
      </a>
    </div>
  </nav>
);

// v1.31.0 — Animated AgentEvalCard mock. Shows the launch story's
// actual magic moment: the eval gate flipping each scenario green
// in sequence, the progress bar filling to 100%, the "Publish
// unlocked" pill appearing. Pure CSS+SVG — no images, theme-aware,
// fast, deploys instantly.
const AgentEvalCard = () => {
  const scenarios = [
    "Greeting", "FAQ accuracy", "Booking",
    "Reschedule", "Refusal", "PII handling",
    "Escalation", "Tone consistency",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 1.0, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mt-14 mx-auto max-w-[820px] bg-[#0d0d10] border border-white/5 rounded-[14px] overflow-hidden text-left shadow-[0_30px_80px_-30px_rgba(31,174,133,0.25),0_0_0_1px_rgba(255,255,255,0.02)]"
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-[14px] py-[10px] bg-[#161619] border-b border-white/5">
        <span className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
        <span className="w-[10px] h-[10px] rounded-full bg-[#ffbd2e]" />
        <span className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
        <div className="flex-1 ml-3 px-3 py-[3px] rounded bg-[#0d0d10] border border-white/5 font-mono text-[11px] text-[#71717a]">
          app.seldonframe.com/agents/acme-hvac/evals
        </div>
      </div>

      {/* Agent header */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-[10px] bg-gradient-to-br from-[#1FAE85] to-[#0e8364] flex items-center justify-center text-[#09090b] text-[15px] font-bold">
            A
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[#fafafa]">Acme HVAC Chatbot</div>
            <div className="text-[11px] text-[#71717a] font-mono">v3 · website-chatbot</div>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 2.6, duration: 0.4 }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1FAE85]/10 border border-[#1FAE85]/30"
        >
          <span className="w-[6px] h-[6px] rounded-full bg-[#1FAE85]" />
          <span className="text-[11px] font-semibold text-[#1FAE85]">Live</span>
        </motion.div>
      </div>

      {/* Eval body */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold text-[#fafafa]">Eval gate</div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.4, duration: 0.3 }}
            className="text-[12px] font-mono text-[#1FAE85]"
          >
            8/8 passed
          </motion.div>
        </div>

        {/* Progress bar */}
        <div className="h-[6px] rounded-full bg-[#1a1a1e] overflow-hidden mb-5">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ delay: 1.3, duration: 1.6, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-[#1FAE85] to-[#24c997]"
          />
        </div>

        {/* Scenarios — fill in green sequentially */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {scenarios.map((label, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3 + i * 0.18, duration: 0.3 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0a1d18] border border-[#1FAE85]/15"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.3 + i * 0.18, duration: 0.25, type: "spring", stiffness: 220 }}
                className="size-3.5 rounded-full bg-[#1FAE85]/20 border border-[#1FAE85] flex items-center justify-center shrink-0"
              >
                <svg viewBox="0 0 12 12" className="size-2 text-[#1FAE85]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5l2.5 2.5L9.5 4" />
                </svg>
              </motion.span>
              <span className="text-[11.5px] text-[#a1a1aa] truncate">{label}</span>
            </motion.div>
          ))}
        </div>

        {/* Publish unlocked */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.8, duration: 0.4 }}
          className="mt-5 flex items-center justify-between p-3 rounded-[10px] bg-[#0a1d18] border border-[#1FAE85]/30"
        >
          <div className="flex items-center gap-2">
            <span className="size-5 rounded-full bg-[#1FAE85] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 12 12" className="size-3 text-[#09090b]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.5l2.5 2.5L9.5 4" />
              </svg>
            </span>
            <span className="text-[13px] font-semibold text-[#fafafa]">Publish unlocked</span>
          </div>
          <span className="text-[11px] font-mono text-[#71717a]">≥ 87.5% threshold</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

const Hero = () => {
  const badges = ["Open Source", "MCP-native", "Claude Code ready"];

  return (
    <section className="relative text-center pt-[72px] pb-[64px] px-5 md:px-12 max-w-[1180px] mx-auto overflow-hidden">
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

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.55 }}
        className="text-[clamp(36px,5.5vw,64px)] font-bold tracking-[-0.04em] leading-[1.05] mb-5 max-w-[840px] mx-auto text-[#fafafa]"
      >
        Build a complete AI-native<br />
        <span className="text-[#1FAE85]">Business OS</span> with natural language
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
        className="text-[17px] text-[#a1a1aa] max-w-[640px] mx-auto mb-9 leading-[1.65] font-normal"
      >
        CRM, website, AI agents, and automations — all in one workspace,
        built and updated through natural language with Claude Code.
        Eval-gated before going live.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75, duration: 0.5 }}
        className="flex justify-center gap-3 flex-wrap"
      >
        <a href="/signup" className={`${PRIMARY_CTA_CLS} hover:-translate-y-[1px] px-[28px] py-3 text-[14px]`}>
          Start for free &rarr;
        </a>
        <a href="/demo" className={`${OUTLINE_CTA_CLS} px-[28px] py-3 text-[14px]`}>
          Watch the demo &#9654;
        </a>
      </motion.div>

      <AgentEvalCard />
    </section>
  );
};

const Personas = () => {
  const personas = [
    {
      icon: "🛠️",
      color: "rgba(31,174,133,0.1)",
      title: "Build for yourself",
      desc: "Solopreneurs, coaches, consultants, micro-SaaS builders. Launch your own AI-native business OS — one workspace, your brand, your agents, your workflows. Stop stitching 6 tools together.",
    },
    {
      icon: "🏢",
      color: "rgba(232,67,147,0.1)",
      title: "Build for your clients",
      desc: "Agencies, freelancers, productized service operators. Deploy a branded Business OS per client in 30 minutes. Charge recurring retainers. Scale to 20+ clients without hiring.",
    },
  ];

  return (
    <section className="text-center py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1140px] mx-auto">
      <h2 className="text-[clamp(26px,3.5vw,38px)] font-bold tracking-[-0.03em] mb-11 text-[#fafafa]">Who is SeldonFrame for?</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[800px] mx-auto">
        {personas.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: i * 0.15, duration: 0.5 }}
          >
            <Card className="bg-[#111113] border-white/5 hover:border-[#1FAE85] transition-all duration-300 hover:-translate-y-[3px] p-7 md:p-9 text-left rounded-[12px]">
              <div
                className="w-11 h-11 mb-[18px] rounded-[8px] flex items-center justify-center text-[20px]"
                style={{ background: p.color }}
              >
                {p.icon}
              </div>
              <h3 className="text-[18px] font-semibold tracking-[-0.02em] mb-2 text-[#fafafa]">{p.title}</h3>
              <p className="text-[14px] text-[#a1a1aa] leading-[1.65]">{p.desc}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

const Features = () => {
  // Fix (e): cost-visibility feature copy reframed.
  // The marketing claim of "Daily digest: ~$0.05. Heat advisory cascade: ~$0.32"
  // is unsupported by running code (per SLICE 11 audit §2.10 + close-out
  // marketing reconciliation). Reframed to "Every LLM call is tracked
  // and attributed."
  const features = [
    { title: "Per-client branding", desc: "Each workspace gets its own brand — colors, copy, domain, customer portal. End-customers see the workspace brand, not yours." },
    { title: "Agents with memory", desc: "Soul gives agents persistent per-entity memory. Customer preferences, service history, relationship context — remembered across every interaction." },
    { title: "Closed-loop attribution", desc: "Every workflow run produces a queryable event log. Every agent action attributes to a customer, a workspace, a cost. The system learns from what it does." },
    { title: "Natural language scaffolding", desc: "Describe a new capability — booking system, intake form, SMS triage flow — and SeldonFrame scaffolds production-ready code. Zero hand-edits required." },
    { title: "Approval gates", desc: "Agents draft; humans approve. Every automated action can require operator or client approval before executing. Build trust before you build autonomy." },
    { title: "Cost visibility", desc: "BYO LLM keys. See per-run cost in your dashboard. Every LLM call is tracked and attributed. You see what you spend, where you spend it." },
  ];

  return (
    <section className="text-center py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1140px] mx-auto">
      <h2 className="text-[clamp(26px,3.5vw,38px)] font-bold tracking-[-0.03em] mb-4 text-[#fafafa]">What is SeldonFrame?</h2>
      <p className="text-[16px] text-[#a1a1aa] max-w-[620px] mx-auto mb-12 leading-[1.7]">
        A platform with composable primitives that lets you create customized AI-native business operating systems — entirely through natural language from your IDE.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
          >
            <Card className="bg-[#111113] border-white/5 p-6 md:p-8 text-left rounded-[12px] h-full">
              <h3 className="text-[14px] font-semibold mb-2 flex items-center gap-2 text-[#fafafa]">
                <span className="w-[7px] h-[7px] rounded-full bg-[#1FAE85] shrink-0" />
                {f.title}
              </h3>
              <p className="text-[13px] text-[#a1a1aa] leading-[1.6]">{f.desc}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

const HowItWorks = () => {
  // May 1, 2026 — collapsed to 3 steps. SeldonFrame is MCP-native, not
  // a CLI tool, so the old four-step "init / scaffold / compose"
  // sequence misrepresented the actual flow. The real flow is:
  //   1. Install — one shell command, one time.
  //   2. Describe — talk to Claude Code in plain English.
  //   3. Launch — landing/booking/intake/CRM/agents go live automatically.
  const steps = [
    {
      title: "Install",
      desc: "One terminal command. SeldonFrame connects to Claude Code via Model Context Protocol — no separate CLI, no config files.",
      code: "claude mcp add seldonframe -- npx -y @seldonframe/mcp",
    },
    {
      title: "Describe",
      desc: "Tell Claude Code about your business in plain English. SeldonFrame extracts the right structure — name, phone, services, testimonials — and seeds your workspace from it.",
      code: "\"Create a Business OS for Desert Cool HVAC, a residential HVAC company in Phoenix, AZ. Phone: (602) 555-0188.\"",
    },
    {
      title: "Launch",
      desc: "Landing page, booking, intake form, CRM, deal pipeline, and AI agents all deploy automatically. Live at <slug>.app.seldonframe.com in under a minute.",
      code: "✅ Workspace live: desert-cool-hvac.app.seldonframe.com",
    },
  ];

  return (
    <section className="text-center py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1140px] mx-auto">
      <h2 className="text-[clamp(26px,3.5vw,38px)] font-bold tracking-[-0.03em] mb-4 text-[#fafafa]">How it works</h2>
      <p className="text-[16px] text-[#a1a1aa] max-w-[560px] mx-auto mb-12">
        Three steps. About a minute. A complete Business OS, live in production.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: i * 0.2, duration: 0.5 }}
            className="relative"
          >
            <Card className="bg-[#111113] border-white/5 p-6 md:p-7 text-left rounded-[12px] h-full relative overflow-hidden">
              <span className="absolute top-3 right-4 text-[44px] font-extrabold text-[#1FAE85] opacity-15 tracking-[-0.04em] leading-none">
                {i + 1}
              </span>
              <h3 className="text-[15px] font-semibold mb-2 text-[#fafafa] relative z-10">{step.title}</h3>
              <p className="text-[13px] text-[#a1a1aa] leading-[1.6] relative z-10">{step.desc}</p>
              <code className="block mt-3 p-3 bg-[#1a1a1e] rounded-[8px] font-mono text-[11.5px] text-[#1FAE85] overflow-x-auto leading-[1.5] relative z-10">
                {step.code}
              </code>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// Fix (g): NEW "See it built" section between HowItWorks and Pricing.
const SeeItBuilt = () => (
  <section className="text-center py-16 md:py-24 px-5 md:px-12 max-w-[1140px] mx-auto">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-[#111113] border-white/5 p-8 md:p-12 rounded-[12px] max-w-[700px] mx-auto">
        <h2 className="text-[clamp(24px,3vw,32px)] font-bold tracking-[-0.03em] mb-3 text-[#fafafa]">
          See it built end-to-end
        </h2>
        <p className="text-[15px] text-[#a1a1aa] mb-6 leading-[1.7] max-w-[500px] mx-auto">
          Desert Cool HVAC. Phoenix, AZ. 14 technicians. ~1,800 customers.
          Four production agent flows. Branded portal. Built in SeldonFrame
          from clean repo to working product.
        </p>
        <a href="/demo" className={`${PRIMARY_CTA_CLS} px-6 py-3 text-[14px]`}>
          Watch the walkthrough &rarr;
        </a>
      </Card>
    </motion.div>
  </section>
);

const Pricing = () => {
  // April 30, 2026 — usage-based pricing migration. Tiers are
  // Free / Growth / Scale (no per-workspace charge — Growth caps at 3,
  // Scale unlimited).
  const tiers = [
    {
      name: "Free", badgeColor: "bg-[#222226] text-[#a1a1aa]", price: "$0",
      workspaceCaption: "1 workspace · free forever",
      features: ["1 workspace", "50 contacts", "100 agent runs / mo", "All core blocks", "BYO LLM keys", "Community support"],
    },
    {
      name: "Growth", badgeColor: "bg-[#1FAE85]/12 text-[#1FAE85]", price: "$29/mo + usage", isFeatured: true,
      workspaceCaption: "3 workspaces included",
      features: ["3 workspaces", "500 contacts + 1,000 runs included", "$0.02/contact + $0.03/run beyond", "Custom domain", "Remove SeldonFrame branding", "Client portal · email support"],
    },
    {
      name: "Scale", badgeColor: "bg-[#e84393]/10 text-[#e84393]", price: "$99/mo + usage",
      workspaceCaption: "Unlimited workspaces",
      features: ["Unlimited contacts", "Agent runs $0.02 each", "Full white-label", "Client portal with custom branding", "Brain Layer 2", "Priority support"],
    },
  ];

  return (
    <section id="pricing" className="text-center py-[64px] md:py-[100px] px-5 md:px-12 max-w-[1140px] mx-auto">
      <h2 className="text-[clamp(26px,3.5vw,38px)] font-bold tracking-[-0.03em] mb-[10px] text-[#fafafa]">Simple pricing. You own the rest.</h2>
      <p className="text-[16px] text-[#a1a1aa] max-w-[560px] mx-auto mb-3">
        Open source. Self-host for free. Hosted tiers scale with your usage — pay only for what you use.
      </p>
      <div className="text-[14px] text-[#1FAE85] font-semibold mb-11">Your first workspace is always free.</div>

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
        <a href="/docs/mcp-servers" className="text-[14px] text-[#1FAE85] hover:underline">
          → Browse 25+ MCP servers for SMB operators
        </a>
      </div>
    </section>
  );
};

const FinalCTA = () => (
  <section className="text-center py-[80px] px-5 md:px-12 border-t border-white/5 max-w-[1140px] mx-auto">
    <h2 className="text-[clamp(26px,3.5vw,38px)] font-bold tracking-[-0.03em] mb-[14px] text-[#fafafa]">Start building in five minutes</h2>
    <p className="text-[16px] text-[#a1a1aa] max-w-[500px] mx-auto mb-7">
      Clone. Scaffold. Deploy. Your first workspace is free. No lock-in — you own the code, the data, the keys.
    </p>
    <div className="flex justify-center gap-3 flex-wrap">
      <a href="/signup" className={`${PRIMARY_CTA_CLS} hover:-translate-y-[1px] px-[26px] py-3 text-[14px]`}>
        Start for free &rarr;
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
        © 2026 SeldonFrame. Open source under MIT License.
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
        <Personas />
        <Features />
        <HowItWorks />
        {/* Fix (g): SeeItBuilt between HowItWorks and Pricing */}
        <SeeItBuilt />
        <Pricing />
        <Infrastructure />
        <FinalCTA />
      </main>
      <Footer />
      <DiscordFloat />
    </div>
  );
}
