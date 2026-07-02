// /build landing content — the pure copy + snippet layer (spec 1ff09dcb).
//
// The developer landing at /build is the human-browsable front door to the
// builder marketplace — the Monid-clean twin of /SKILL.md. This module owns the
// LOAD-BEARING strings that page renders: the hero command, the
// discover→inspect→run story, the three rentable types, the realistic IDE chat
// snippet, the pricing facts, and the `claude mcp add` connect snippet. Keeping
// them here (pure: no React, no I/O, no "use server") lets the funnel content be
// pinned with plain string assertions and reused verbatim by the page + tests —
// the same discipline as skill-md.ts and developer-key.ts.
//
// The two cross-surface invariants this guarantees: the hero command, the MCP
// origin, and the key/wallet paths MATCH SKILL.md (one funnel, two surfaces),
// and the builder split is stated honestly (keep 95%, SF takes 5%, errors free).

import { SKILL_MD_MCP_URL, SKILL_MD_KEYS_PATH } from "@/lib/build/skill-md";
import { buildMcpConnectSnippet } from "@/lib/build/developer-key";

// ─── the one-command hero funnel ─────────────────────────────────────────────

/** The headline command a dev pastes into their IDE agent — the single entry
 *  point, identical to the one SKILL.md documents. Copyable in the hero. */
export const BUILD_SETUP_COMMAND = "set up https://seldonframe.com/SKILL.md";

/** Where a dev mints the `wst_` workspace bearer (reused from SKILL.md). */
export const BUILD_KEYS_PATH = SKILL_MD_KEYS_PATH;

/** The prepaid-wallet surface (balance + top-up). */
export const BUILD_WALLET_PATH = "/build/wallet";

/** The MCP origin the IDE connector points at (reused from SKILL.md). */
export const BUILD_MCP_URL = SKILL_MD_MCP_URL;

/** The builder's revenue share — they keep this much of every paid run. */
export const BUILDER_KEEP_PCT = 95;

/** SeldonFrame's clean take on usage (the only fee, on real runs). */
export const SELDONFRAME_FEE_PCT = 100 - BUILDER_KEEP_PCT; // 5

// ─── the discover → inspect → run story (section 2) ──────────────────────────

export type FlowStep = {
  key: "discover" | "inspect" | "run";
  icon: "search" | "file" | "play";
  title: string;
  body: string;
};

/** The three-verb consumption story, each a card. Mirrors the SKILL.md flow so
 *  the landing and the doc tell the same story. */
export const FLOW_STEPS: FlowStep[] = [
  {
    key: "discover",
    icon: "search",
    title: "discover",
    body: "Search the catalog in natural language. Each result comes back ranked, with its price attached.",
  },
  {
    key: "inspect",
    icon: "file",
    title: "inspect",
    body: "Get the input schema, pricing, and docs for any entry — so your agent knows exactly how to call it.",
  },
  {
    key: "run",
    icon: "play",
    title: "run",
    body: "Execute with structured input and get the result inline. One balance pays for it; errors are never charged.",
  },
];

// ─── the three rentable types (section 2) ────────────────────────────────────

export type RentableType = {
  icon: "package" | "sparkles" | "users";
  name: string;
  count: string;
  body: string;
};

/** The three things every workspace key can rent through one flow, one balance.
 *  Tools = the 1000+ connected-action surface; Skills + Agents are the SF catalog.
 *  (We state "1000+ tools" to the builder, not the upstream vendor name.) */
export const RENTABLE_TYPES: RentableType[] = [
  {
    icon: "package",
    name: "Tools",
    count: "1000+ tools",
    body: "Send an email, create a calendar event, update a CRM — call a single connected action and pay per call.",
  },
  {
    icon: "sparkles",
    name: "Skills",
    count: "Composable capabilities",
    body: "Drop a packaged skill into your own agent — qualify a lead, draft a quote, summarize a thread.",
  },
  {
    icon: "users",
    name: "Agents",
    count: "Whole workers",
    body: "Rent a complete agent — a 24/7 receptionist, a review chaser — and call it over MCP like a teammate.",
  },
];

// ─── the realistic IDE chat snippet (section 3) ──────────────────────────────

export type ChatTurn = { role: "you" | "agent"; text: string };

/** The natural-language ask a builder types, and the tool chain their IDE agent
 *  runs in response. The realistic "build me a receptionist and list it" moment
 *  from the spec — shown as an IDE chat transcript. */
export const IDE_CHAT: ChatTurn[] = [
  {
    role: "you",
    text: "build me a 24/7 receptionist that answers calls, qualifies the lead, and books the job — then list it for $0.10/call.",
  },
  {
    role: "agent",
    text: "On it. Generating the blueprint, running its evals, then publishing with a per-call price.",
  },
];

/** The MCP tool chain the agent runs for that ask — rendered as a compact,
 *  monospaced "running…" trace under the chat. The real tool names, in order. */
export const IDE_TOOL_CHAIN: string[] = [
  "create_agent",
  "run_agent_evals",
  "publish_agent",
  "set_usage_price",
];

// ─── the connect snippet (section 5) ─────────────────────────────────────────

/** The placeholder a dev swaps for the `wst_` key they mint at /build/keys. */
export const KEY_PLACEHOLDER = "wst_your_key";

/**
 * The copyable `claude mcp add seldonframe …` command for the Connect section.
 * Reuses buildMcpConnectSnippet (the SAME generator the /settings/api reveal
 * panel and SKILL.md use) with a visible placeholder key, so the three surfaces
 * never drift. Pure — same output every call.
 */
export function buildLandingConnectSnippet(): string {
  return buildMcpConnectSnippet(KEY_PLACEHOLDER, BUILD_MCP_URL);
}

// ─── pricing facts (section 4) ───────────────────────────────────────────────

export type PricingPoint = { icon: "check" | "dollar" | "shield" | "trending"; text: string };

/** The honest pricing facts, each a checked line. Framing leads with the
 *  builder's win — free to list, no upfront cost — and states SeldonFrame's
 *  fee plainly (a clean 5% on usage, only on success) without making "keep 95%"
 *  the headline. Low-key by design (the AWS/Vercel/Neon/Monid register). */
export const PRICING_POINTS: PricingPoint[] = [
  { icon: "dollar", text: "Listing is free. No subscription, no seat fee, no upfront cost." },
  { icon: "trending", text: `You earn per call. Set per-call or per-outcome pricing from your IDE.` },
  { icon: "check", text: `SeldonFrame's only fee is a clean ${SELDONFRAME_FEE_PCT}% on usage — taken only when a run succeeds. We make money when you do.` },
  { icon: "shield", text: "Prepaid wallet draws down per run, and errored runs are never charged." },
];

// ─── the low-key FAQ (the bottom-of-page "common questions") ──────────────────

export type FaqItem = { q: string; a: string };

/**
 * The understated "Common questions" block at the foot of /build — the
 * AWS/Vercel/Neon/Monid register, where the fee is a plain factual line rather
 * than a headline. Also the page's home for the truth that SeldonFrame is a full
 * agent-building toolchain: build, TEST (send a live turn), EVAL (gated publish),
 * OBSERVE (logs + replay), and a Brain that learns from every run — not just
 * build → list → run. Pure copy; rendered verbatim by the page + the .md twin +
 * pinned by tests, so the fee line + the primitive names never drift.
 */
export const BUILD_FAQ: FaqItem[] = [
  {
    q: "Do I need to host anything?",
    a: "No. SeldonFrame runs your agent — voice, chat, SMS, and email — on its own infrastructure. You bring the keys your agent calls (for a voice agent, an OpenAI key); everything else runs on us.",
  },
  {
    q: "How does pricing work?",
    a: "Pay-per-call. You set each agent's rate — per call or per outcome — from your IDE. Listing is free: no subscription, no seat fee, no minimums.",
  },
  {
    q: "What does SeldonFrame charge?",
    a: `A clean ${SELDONFRAME_FEE_PCT}% on usage, taken only when a run succeeds. Nothing upfront — we only make money when you do.`,
  },
  {
    q: "Can I test, eval, and watch my agent before I sell it?",
    a: "Yes — testing, evals, and logs are first-class. Send a live test turn with send_conversation_turn, run the eval suite with run_agent_evals (publishing a live agent is eval-gated), then watch every run with tail_agent_conversations and replay_conversation. The Brain logs all activity and feeds the lessons back into your next build.",
  },
  {
    q: "A run failed. Am I charged?",
    a: "No. Only successful runs draw down the wallet — errored runs are never billed.",
  },
  {
    q: "Which editors and agents work?",
    a: "Any MCP client — Claude Code, Cursor, Codex — plus the same workspace key over the CLI and the HTTP API.",
  },
];

// ─── "One server. Every IDE." — the per-IDE install section ──────────────────
//
// Distinct from the Connect section above (which wires the *builder
// marketplace* MCP over Streamable HTTP with a minted `wst_` key). This section
// is the OTHER on-ramp: installing the published `@seldonframe/mcp` npm package
// as a local stdio server, so an IDE agent can spin up a full workspace (site +
// booking + intake + CRM + agents) with zero upfront key — first workspace is
// free. Six entries, one per IDE, each independently verified against that
// IDE's own current docs (see render-build-markdown.ts / the /build page for
// the citation trail in source comments). File-config snippets only — no
// deeplinks, since none of the six IDEs documents a verified one-click install
// URI for a third-party stdio MCP server today.

export type IdeInstallEntry = {
  key: "claude-code" | "cursor" | "windsurf" | "vscode" | "zed" | "codex";
  name: string;
  /** How the snippet should be rendered: a shell one-liner, or a config file
   *  (path + language for syntax highlighting + the file contents). */
  kind: "cli" | "file";
  /** Present when kind === "cli". */
  cliCommand?: string;
  /** Present when kind === "file". */
  filePath?: string;
  fileLanguage?: "json" | "toml";
  fileContents?: string;
};

/** The npm package every snippet installs — published, working today. */
export const IDE_NPM_PACKAGE = "@seldonframe/mcp";

/** `npx -y @seldonframe/mcp` — the stdio command every IDE ultimately runs. */
export const IDE_NPX_COMMAND = `npx -y ${IDE_NPM_PACKAGE}`;

export const IDE_INSTALLS: IdeInstallEntry[] = [
  {
    key: "claude-code",
    name: "Claude Code",
    kind: "cli",
    cliCommand: `claude mcp add seldonframe -- ${IDE_NPX_COMMAND}`,
  },
  {
    key: "cursor",
    name: "Cursor",
    kind: "file",
    filePath: "~/.cursor/mcp.json",
    fileLanguage: "json",
    fileContents: JSON.stringify(
      { mcpServers: { seldonframe: { command: "npx", args: ["-y", IDE_NPM_PACKAGE] } } },
      null,
      2,
    ),
  },
  {
    key: "windsurf",
    name: "Windsurf",
    kind: "file",
    filePath: "~/.codeium/windsurf/mcp_config.json",
    fileLanguage: "json",
    fileContents: JSON.stringify(
      { mcpServers: { seldonframe: { command: "npx", args: ["-y", IDE_NPM_PACKAGE] } } },
      null,
      2,
    ),
  },
  {
    key: "vscode",
    name: "VS Code",
    kind: "file",
    filePath: ".vscode/mcp.json",
    fileLanguage: "json",
    fileContents: JSON.stringify(
      { servers: { seldonframe: { command: "npx", args: ["-y", IDE_NPM_PACKAGE] } } },
      null,
      2,
    ),
  },
  {
    key: "zed",
    name: "Zed",
    kind: "file",
    filePath: "settings.json",
    fileLanguage: "json",
    fileContents: JSON.stringify(
      {
        context_servers: {
          seldonframe: { source: "custom", command: "npx", args: ["-y", IDE_NPM_PACKAGE] },
        },
      },
      null,
      2,
    ),
  },
  {
    key: "codex",
    name: "Codex CLI",
    kind: "file",
    filePath: "~/.codex/config.toml",
    fileLanguage: "toml",
    fileContents: ["[mcp_servers.seldonframe]", 'command = "npx"', `args = ["-y", "${IDE_NPM_PACKAGE}"]`].join("\n"),
  },
];

/** The natural-language example an operator says once connected — the same
 *  "no upfront key" line used on the /build page + README + .md twin. */
export const IDE_NO_KEY_EXAMPLE =
  "build me an AI receptionist for an HVAC company";
