// Marketing homepage → clean Markdown twin (`/home.md`).
//
// The seldonframe.com homepage (app/(public)/page.tsx → PublicHomePage) is rich,
// inline-styled marketing HTML across ~10 React section components — an LLM that
// pulls it wastes most of its tokens on Tailwind classes and SVG chrome. This is
// the agent-legible version: the SAME load-bearing copy (headline, the one-line
// positioning, the 3-step "how it works", the modules/agents it ships, pricing)
// rendered as plain Markdown a model can quote directly.
//
// SINGLE SOURCE for the positioning line: imported from the page module
// (POSITIONING_ONE_LINER) so the headline promise can't drift between the HTML
// and the Markdown. The remaining section copy is a compact, hand-curated mirror
// of the homepage sections — kept here (not re-scraped from JSX) because the copy
// is spread across client components with motion/markup that isn't extractable as
// data. Per the GEO research, this leads with concrete specifics (what it builds,
// the 60-second claim, the $29 price, named capabilities), not metadata.
//
// PURE — no I/O, no React — so it unit-tests with no fixtures.

import { POSITIONING_ONE_LINER } from "@/app/(public)/home-copy";

/** Canonical public origin for absolute links (mirrors sitemap's siteBaseUrl
 *  default). A pasted `.md` always carries clickable, absolute URLs. */
export const HOME_BASE_URL = "https://seldonframe.com";

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** Absolute URL of the human homepage (the HTML twin this Markdown points at). */
export function homeUrl(baseUrl: string = HOME_BASE_URL): string {
  return trimBase(baseUrl) || HOME_BASE_URL;
}

/** The three "how it works" steps, mirroring marketing-build-steps.tsx. */
const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Paste a URL — or describe the business.",
    body: "Your existing website, or a quick description. SeldonFrame builds from either.",
  },
  {
    title: "Watch it spin up in about 60 seconds.",
    body: "A multi-page website, booking page, intake form, and CRM — plus a 24/7 AI agent that answers across voice, SMS, chat, and email. Everything wired together.",
  },
  {
    title: "Run it yourself — or hand it to a client.",
    body: "SMBs run it directly. Agencies resell it under their own brand on a custom domain. Either way, you own it.",
  },
];

/** What every workspace ships with, mirroring the homepage modules/agents grid. */
const INCLUDES: ReadonlyArray<{ name: string; body: string }> = [
  {
    name: "Website",
    body: "A multi-page service site, generated from your URL and ready for customers.",
  },
  {
    name: "Booking page",
    body: "Calendar-first booking tied to live availability; confirmed bookings flow into the CRM.",
  },
  {
    name: "Intake form",
    body: "Logic-aware fields that adapt by service type, so leads arrive pre-qualified with full context.",
  },
  {
    name: "CRM",
    body: "Leads, deals, tasks, and notes tied to the contact — built for local service businesses, not a spreadsheet.",
  },
  {
    name: "AI receptionist",
    body: "Answers, qualifies, and books the job straight into your calendar, in your own voice. Never miss a lead.",
  },
  {
    name: "Missed-call text-back",
    body: "Can't pick up? It texts the caller back in under 60 seconds — before they dial a competitor.",
  },
  {
    name: "Review requester",
    body: "After a good job, it asks happy customers for a 5-star Google review at the right moment.",
  },
];

const PROOF: ReadonlyArray<string> = [
  "Build it free",
  "Live in about 60 seconds",
  "$29/mo flat",
  "Unlimited workspaces",
  "Bring your own AI key (ChatGPT, Claude, or Gemini) — we show you how",
  "Cancel anytime",
];

/**
 * Render the marketing homepage as clean Markdown: H1 promise, the one-line
 * positioning, "How it works" (3 steps), "What every workspace includes", the
 * pricing/proof facts, and a link back to the human page. Pure; the base URL is
 * overridable for tests / non-prod hosts.
 */
export function renderHomeMarkdown(baseUrl: string = HOME_BASE_URL): string {
  const base = homeUrl(baseUrl);
  const lines: string[] = [];

  lines.push("# SeldonFrame — a whole client front office, live in 60 seconds");
  lines.push("");
  lines.push(`> ${POSITIONING_ONE_LINER}`);
  lines.push("");
  lines.push(
    "SeldonFrame is the platform agencies use to sell AI front offices (and operators use to run their own). Paste a client's website URL (or describe the business) and it builds a multi-page website, booking page, intake form, and CRM — wired together and ready for customers — then adds no-code AI agents that answer every call, request reviews, and handle DMs and email.",
  );
  lines.push("");

  lines.push("## How it works");
  lines.push("");
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    lines.push(`${i + 1}. **${step.title}** ${step.body}`);
  }
  lines.push("");

  lines.push("## What every workspace includes");
  lines.push("");
  for (const item of INCLUDES) {
    lines.push(`- **${item.name}:** ${item.body}`);
  }
  lines.push("");

  lines.push("## Pricing");
  lines.push("");
  lines.push(
    "Build it free, then **$29/mo flat** for unlimited workspaces. Bring your own AI key (ChatGPT, Claude, or Gemini); SeldonFrame shows you how to connect it in about 30 seconds. Cancel anytime.",
  );
  lines.push("");
  for (const item of PROOF) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  lines.push("## Links");
  lines.push("");
  lines.push(`- Home: ${base}/`);
  lines.push(`- Pricing: ${base}/pricing`);
  lines.push(`- Agent marketplace: ${base}/marketplace`);
  lines.push(`- AI agent library: ${base}/ai-agents`);
  lines.push(`- Start free: ${base}/signup`);
  lines.push("");
  lines.push(`See the full homepage: ${base}/`);
  lines.push("");

  return lines.join("\n");
}
