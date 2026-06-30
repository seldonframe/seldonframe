// /build → clean Markdown (the "agent-legible twin" of the developer landing).
//
// SINGLE SOURCE OF TRUTH: this renders from the SAME pure copy modules the HTML
// /build page renders — lib/build/landing-content (the hero command, the
// discover→inspect→run story, the rentable types, the honest pricing facts, the
// connect snippet) and the SKILL.md path/MCP constants. It NEVER hard-codes a
// parallel copy of those facts, so the Markdown twin can never drift from the
// page (the same discipline as lib/marketplace/render-markdown.ts for the
// storefront, and the unit tests pin the no-drift invariant).
//
// Everything here is PURE (no I/O, no db, no React) so it unit-tests with plain
// assertions. The `.md` route handler (app/build.md) just calls this and serves
// the string — exactly like the SKILL.md route serves buildSkillMd().
//
// Why Markdown front-loads concrete specifics (the one command, the tool chain,
// the price split) over prose: the GEO research found quotable, stat-backed
// content — not metadata — is what moves AI visibility. So /build.md leads with
// the load-bearing facts an IDE agent needs to act.

import {
  BUILD_SETUP_COMMAND,
  BUILD_KEYS_PATH,
  BUILD_WALLET_PATH,
  BUILDER_KEEP_PCT,
  SELDONFRAME_FEE_PCT,
  FLOW_STEPS,
  RENTABLE_TYPES,
  IDE_TOOL_CHAIN,
  PRICING_POINTS,
  buildLandingConnectSnippet,
} from "@/lib/build/landing-content";

/** The canonical public origin for absolute links in the Markdown. Defaults to
 *  the marketing host so a pasted `.md` always carries clickable URLs (mirrors
 *  the root layout metadataBase + sitemap base). */
export const BUILD_BASE_URL = "https://seldonframe.com";

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** Absolute URL of the human-browsable /build landing page. */
export function buildUrl(baseUrl: string = BUILD_BASE_URL): string {
  return `${trimBase(baseUrl)}/build`;
}

/** Absolute URL of a root-relative builder path (e.g. the keys/wallet pages). */
function abs(path: string, baseUrl: string): string {
  return `${trimBase(baseUrl)}${path}`;
}

/**
 * Render the /build developer landing as clean Markdown: the one-command funnel,
 * the build→list→price tool chain, the discover→inspect→run consumption flow,
 * the MCP connect snippet, and the honest pricing. Pure — same output every call
 * for a given base. The route handler does the (zero) data-loading and serves
 * this verbatim.
 */
export function renderBuildMarkdown(baseUrl: string = BUILD_BASE_URL): string {
  const lines: string[] = [];

  lines.push("# Build & sell an AI agent on SeldonFrame — from your IDE");
  lines.push("");
  lines.push(
    "> Describe an agent in one sentence and your IDE agent builds it, runs its " +
      "evals, lists it on the marketplace, and sets a usage price — over MCP. No " +
      "dashboard, no subscription. Listing is free; you earn when someone runs it.",
  );
  lines.push("");
  lines.push(
    `This is the human-browsable twin of [/SKILL.md](${abs("/SKILL.md", baseUrl)}). ` +
      "It is the developer front door to the SeldonFrame builder marketplace.",
  );
  lines.push("");

  // ── Set up — the one command ────────────────────────────────────────────────
  lines.push("## Set up");
  lines.push("");
  lines.push("In Claude Code, Cursor, or Codex, run:");
  lines.push("");
  lines.push("```");
  lines.push(BUILD_SETUP_COMMAND);
  lines.push("```");
  lines.push("");
  lines.push(
    "Your agent reads the skill and learns the whole build → list → price → run " +
      "flow below.",
  );
  lines.push("");

  // ── Connect the MCP ─────────────────────────────────────────────────────────
  lines.push("## Connect the MCP");
  lines.push("");
  lines.push(
    `Mint a workspace key at [${BUILD_KEYS_PATH}](${abs(BUILD_KEYS_PATH, baseUrl)}) ` +
      "(your first workspace is free), then add the SeldonFrame MCP connector with " +
      "it — swap `wst_your_key` for the key you minted:",
  );
  lines.push("");
  lines.push("```bash");
  lines.push(buildLandingConnectSnippet());
  lines.push("```");
  lines.push("");

  // ── Build → list → price ────────────────────────────────────────────────────
  lines.push("## Build, list & price an agent");
  lines.push("");
  lines.push(
    "Just describe it. Your IDE agent runs the build → list → price tool chain:",
  );
  lines.push("");
  for (const tool of IDE_TOOL_CHAIN) {
    lines.push(`- \`${tool}\``);
  }
  lines.push("");
  lines.push(
    "Example: _“build me a 24/7 receptionist that answers calls, qualifies the " +
      "lead, and books the job — then list it for $0.10/call.”_",
  );
  lines.push("");

  // ── Test, observe & improve (the rest of the toolchain) ─────────────────────
  lines.push("## Test, observe & improve");
  lines.push("");
  lines.push(
    "Building is only the start — SeldonFrame gives your agent the full toolchain:",
  );
  lines.push("");
  lines.push(
    "- **Test** — `send_conversation_turn` runs one live turn against the agent so " +
      "you can try it before publishing.",
  );
  lines.push(
    "- **Eval** — `run_agent_evals` runs the eval suite and returns a pass-rate " +
      "summary with the judge's findings. Publishing a live agent is eval-gated.",
  );
  lines.push(
    "- **Observe** — `tail_agent_conversations`, `get_agent_conversation`, and " +
      "`replay_conversation` stream the logs of every real run; `get_agent_metrics` " +
      "rolls up health (eval pass-rate, validator pass-rate, conversations).",
  );
  lines.push(
    "- **Improve** — the Brain logs all activity (`write_brain_note` / " +
      "`read_brain_path`) and feeds the lessons back into your next build, so each " +
      "generation gets smarter.",
  );
  lines.push("");

  // ── Run anything in the catalog (discover → inspect → run) ───────────────────
  lines.push("## Run anything in the catalog");
  lines.push("");
  lines.push(
    "The same workspace key lets your agent consume the marketplace. Every sellable " +
      "thing — tools, skills, whole agents — is discovered, priced, and run the same " +
      "way:",
  );
  lines.push("");
  for (const step of FLOW_STEPS) {
    lines.push(`- **${step.title}** — ${step.body}`);
  }
  lines.push("");
  lines.push("Three rentable types, one prepaid balance:");
  lines.push("");
  for (const t of RENTABLE_TYPES) {
    lines.push(`- **${t.name}** (${t.count}) — ${t.body}`);
  }
  lines.push("");

  // ── Pricing — the honest split ──────────────────────────────────────────────
  lines.push("## Pricing");
  lines.push("");
  lines.push(
    `Listing is free — no upfront cost, no subscription, no seat fee. SeldonFrame's ` +
      `only fee is a clean **${SELDONFRAME_FEE_PCT}%** on successful usage (you keep ` +
      `the other **${BUILDER_KEEP_PCT}%**), and errored runs are never charged. We ` +
      "make money when you do.",
  );
  lines.push("");
  for (const p of PRICING_POINTS) {
    lines.push(`- ${p.text}`);
  }
  lines.push("");
  lines.push(
    `Top up your prepaid wallet at [${BUILD_WALLET_PATH}](${abs(BUILD_WALLET_PATH, baseUrl)}).`,
  );
  lines.push("");

  // ── Footer — the human twin + endpoints ─────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push(`Open the quickstart in a browser: ${buildUrl(baseUrl)}`);
  lines.push("");
  lines.push(
    "HTTP API: `/api/v1/build/discover`, `/api/v1/build/inspect`, `/api/v1/build/run`.",
  );
  lines.push("");

  return lines.join("\n");
}
