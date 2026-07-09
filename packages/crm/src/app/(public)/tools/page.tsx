// /tools — the free-tools hub (PostPlanify motion: high-intent utility pages
// that rank and convert). Add new tools here + sitemap + llms.txt.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";

export const metadata: Metadata = {
  title: "Free tools for local service businesses — SeldonFrame",
  description: "Free calculators and tools for service businesses and the agencies that serve them: missed-call cost, AI receptionist ROI, and more.",
  alternates: { canonical: "/tools" },
};

const TOOLS = [
  {
    href: "/tools/ai-visibility-checker",
    name: "AI Visibility Checker",
    blurb: "Can ChatGPT recommend your business? Grade your AI visibility and get the exact prompts to test it yourself.",
  },
  {
    href: "/tools/speed-to-lead-calculator",
    name: "Speed-to-Lead Calculator",
    blurb: "See the revenue slow lead follow-up costs you — and what replying in under 5 minutes recovers.",
  },
  {
    href: "/tools/no-show-cost-calculator",
    name: "No-Show Cost Calculator",
    blurb: "Estimate what no-shows cost your practice each month — and what automated reminders and AI confirmations recover.",
  },
  {
    href: "/tools/ai-receptionist-script-generator",
    name: "AI Receptionist Script Generator",
    blurb: "Generate a complete AI receptionist call script for your business — greeting, questions, booking, after-hours. Copy it free.",
  },
  {
    href: "/tools/service-business-faq-generator",
    name: "Service Business FAQ Generator",
    blurb: "Generate a ready-to-use customer FAQ for your service business — and your AI agent's knowledge base. Copy free.",
  },
  {
    href: "/tools/booking-friction-grader",
    name: "Booking Friction Grader",
    blurb: "Answer 8 questions to score how easy you make it to book — and get the specific fixes losing you appointments.",
  },
  {
    href: "/tools/missed-call-calculator",
    name: "Missed Call Cost Calculator",
    blurb: "Estimate the monthly revenue missed calls cost your business — and what an AI receptionist recovers.",
  },
  {
    href: "/tools/ai-receptionist-cost-calculator",
    name: "AI Receptionist Cost Calculator",
    blurb: "Compare what a human receptionist, an answering service and per-minute AI really cost per month.",
  },
  {
    href: "/tools/google-review-link-generator",
    name: "Google Review Link Generator",
    blurb: "Turn your Google Place ID into a direct review link and a printable QR code — free, no signup.",
  },
  {
    href: "/tools/review-response-generator",
    name: "Review Response Generator",
    blurb: "Well-written replies to any Google review — pick the rating, scenario and tone, then copy.",
  },
  {
    href: "/tools/a2p-10dlc-checker",
    name: "A2P 10DLC Compliance Checker",
    blurb: "Nine questions to find out whether your business texting is registered right — before carriers filter it.",
  },
  {
    href: "/tools/hubspot-pricing-calculator",
    name: "HubSpot Pricing Calculator",
    blurb: "Seats, contacts, hubs and the $3,000 onboarding — see what HubSpot really costs before the sales call.",
  },
  {
    href: "/tools/gohighlevel-cost-calculator",
    name: "GoHighLevel Cost Calculator",
    blurb: "Base plan + AI Employee per sub-account + usage, multiplied by your client count — the real agency bill.",
  },
  {
    href: "/tools/voice-ai-cost-calculator",
    name: "Voice AI Cost Calculator",
    blurb: "STT + LLM + TTS + telephony stacked per minute — why the advertised $0.05/min is really ~$0.30.",
  },
  {
    href: "/tools/klaviyo-cost-calculator",
    name: "Klaviyo Cost Calculator",
    blurb: "Profiles and SMS sends in, monthly bill out — including the suppressed-profiles gotcha.",
  },
  {
    href: "/tools/agency-margin-calculator",
    name: "Agency Margin Calculator",
    blurb: "Retainer minus tool stack minus labor — see your real margin per client and what a flat stack changes.",
  },
  {
    href: "/tools/claude-project-brief-generator",
    name: "Claude Project Brief Generator",
    blurb: "Generate the complete standing-instructions block (role, tasks, tone, never-list) for a Claude Project — ready to paste.",
  },
  {
    href: "/tools/ai-website-generator",
    name: "AI Website Generator",
    blurb: "Paste your Google Business Profile or describe your business — get a real hosted website, booking page, intake form and CRM in 3 minutes. Free.",
  },
  {
    href: "/tools/free-booking-page",
    name: "Free Booking Page",
    blurb: "A real online booking page on your own subdomain — appointment types, intake form, and CRM sync. Live in 3 minutes, free.",
  },
  {
    href: "/tools/website-grader",
    name: "Local Business Website Grader",
    blurb: "Score your website on the 7 things that actually win local jobs — speed, booking, trust signals, and more.",
  },
];

export default function ToolsHubPage(): ReactElement {
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <MarketplaceNav />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px 70px", width: "100%" }}>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em" }}>Free tools</h1>
        <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 640 }}>
          Free calculators for local service businesses and the agencies that serve them. No signup required.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginTop: 30 }}>
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="sf-link" style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 14, padding: "20px 22px", textDecoration: "none", color: MKT.ink, background: "rgba(255,255,255,0.55)", display: "block" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{t.name}</div>
              <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.62)" }}>{t.blurb}</p>
            </Link>
          ))}
        </div>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
