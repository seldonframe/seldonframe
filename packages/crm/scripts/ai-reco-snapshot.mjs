#!/usr/bin/env node
// scripts/ai-reco-snapshot.mjs — the reusable generator for the AI
// Recommendation Index (/charts/ai-recommendation-index). Run monthly to
// regenerate the raw-output archive that feeds
// src/lib/seo/ai-reco-index-data.ts.
//
// This script IS the methodology: the fixed 10-question prompt set below is
// versioned here and must not change silently — if the questions change,
// that's a new methodology and should be called out in the page/FAQ.
//
// Usage (from packages/crm):
//   node scripts/ai-reco-snapshot.mjs
//
// What it does:
//   1. Runs each question through the local `claude` CLI (--model sonnet,
//      n=1) and captures the verbatim answer.
//   2. Attempts the same question against the DataForSEO SERP API
//      (POST /v3/serp/google/organic/live/advanced) looking for a live
//      Google AI Overview block. Requires DATAFORSEO_AUTH_B64 in
//      packages/crm/.env.local. If the account lacks SERP access, the
//      calls fail, or no AI Overview block is present, that is recorded
//      plainly — this script NEVER fabricates the column.
//   3. Writes a dated raw-output Markdown file to
//      docs/strategy/ai-reco-index/<date>-raw.md for manual scoring into
//      src/lib/seo/ai-reco-index-data.ts (scoring/normalization is a human
//      + LLM judgment step, not automated here, so brand-name aliasing
//      stays deliberate).
//
// This script makes network calls and costs a small amount of DataForSEO
// credit per run (~$0.002-$0.004/question). It is not run in CI or on a
// schedule automatically — invoke it deliberately for a new snapshot.

import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRM_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(CRM_ROOT, "../..");

// ─── the fixed prompt set — the methodology. Do not edit casually. ─────────
export const QUESTIONS = [
  "best CRM for a small plumbing business",
  "best CRM for a cleaning business",
  "best appointment booking software for a small service business",
  "best AI receptionist for a small business",
  "best GoHighLevel alternative",
  "best HubSpot alternative for a small business",
  "best free CRM for a one-person business",
  "best missed-call text-back software",
  "best all-in-one platform for a marketing agency serving local businesses",
  "best voice AI for answering business calls",
];

const CLAUDE_SUFFIX = "Answer with a ranked list of up to 5 specific products and one line why each.";
const CLAUDE_MODEL = "sonnet";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run one question through the local `claude` CLI. Returns the verbatim
 *  stdout, or null if the CLI call fails (never throws — a failed question
 *  should not abort the whole snapshot). */
function runClaudeQuestion(question) {
  const prompt = `${question}. ${CLAUDE_SUFFIX}`;
  try {
    const out = execFileSync("claude", ["-p", prompt, "--model", CLAUDE_MODEL], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: 90_000,
    });
    return out.trim();
  } catch (err) {
    console.error(`[claude] failed for "${question}": ${err.message}`);
    return null;
  }
}

/** Query DataForSEO's live SERP endpoint for one question and look for an
 *  ai_overview item. Returns { cost, hasAiOverview, aiOverview, organicTop,
 *  failed } — never throws; a failed/absent AI Overview is a valid,
 *  honestly-reported result, not an error to hide. */
async function fetchGoogleAiOverview(question, authB64, retries = 3) {
  const body = [{ keyword: question, location_code: 2840, language_code: "en", device: "desktop", depth: 20 }];
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
        method: "POST",
        headers: { Authorization: `Basic ${authB64}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      const task = json.tasks?.[0];
      const cost = task?.cost ?? 0;
      const result = task?.result?.[0];
      const items = result?.items ?? [];
      const aiOverview = items.find((i) => i.type === "ai_overview") ?? null;
      const organicTop = items
        .filter((i) => i.type === "organic")
        .slice(0, 6)
        .map((i) => ({ rank: i.rank_absolute, title: i.title, domain: i.domain, url: i.url }));
      return { cost, hasAiOverview: !!aiOverview, aiOverview, organicTop, failed: false };
    } catch (err) {
      if (attempt === retries - 1) {
        console.error(`[dataforseo] failed for "${question}" after ${retries} attempts: ${err.message}`);
        return { cost: 0, hasAiOverview: false, aiOverview: null, organicTop: [], failed: true };
      }
      await sleep(1500 * (attempt + 1));
    }
  }
}

async function main() {
  const date = todayIso();
  const authB64 = process.env.DATAFORSEO_AUTH_B64;

  console.log(`AI Recommendation Index snapshot — ${date}`);
  console.log(`DataForSEO key present: ${!!authB64}`);

  const claudeSections = [];
  const dfsResults = [];
  let totalCost = 0;
  let anyAiOverview = false;

  for (const question of QUESTIONS) {
    console.log(`\n> Claude: "${question}"`);
    const answer = runClaudeQuestion(question);
    claudeSections.push({ question, answer });

    if (authB64) {
      console.log(`> DataForSEO: "${question}"`);
      const dfs = await fetchGoogleAiOverview(question, authB64);
      dfsResults.push({ question, ...dfs });
      totalCost += dfs.cost;
      if (dfs.hasAiOverview) anyAiOverview = true;
      await sleep(800);
    }
  }

  const outDir = path.join(REPO_ROOT, "docs", "strategy", "ai-reco-index");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${date}-raw.md`);

  const claudeMd = claudeSections
    .map(
      (s, i) =>
        `### Q${i + 1}: "${s.question}"\n\n${s.answer ?? "_FAILED — no answer captured this run._"}\n`,
    )
    .join("\n");

  const dfsStatus = !authB64
    ? "DATAFORSEO_AUTH_B64 not set — Google AI Overviews column skipped entirely this run."
    : anyAiOverview
      ? `AI Overview blocks found for some questions. Total spend: $${totalCost.toFixed(4)}. See per-question results below.`
      : `No AI Overview blocks were present for any question this run (total spend $${totalCost.toFixed(4)}). Ship Claude-only unless a later run finds AI Overview data — never fabricate this column.`;

  const dfsMd = dfsResults
    .map((r, i) => {
      const status = r.failed ? "FAILED (network/API error)" : r.hasAiOverview ? "AI Overview present" : "no AI Overview rendered";
      return `### Q${i + 1}: "${r.question}" — ${status}\n\n${r.hasAiOverview ? JSON.stringify(r.aiOverview, null, 2) : "(none)"}\n`;
    })
    .join("\n");

  const content = `# AI Recommendation Index — raw outputs — ${date} snapshot

Methodology: 10 fixed buyer questions, run once each (n=1) through two engines.
Claude column via local \`claude\` CLI, \`--model ${CLAUDE_MODEL}\`, prompt suffix
"${CLAUDE_SUFFIX}"
Run date: ${date}. Google AI Overview column via DataForSEO SERP API
(\`/v3/serp/google/organic/live/advanced\`), same date.

Answers vary run to run. This is a snapshot, not a benchmark.

---

## 1. Claude (${CLAUDE_MODEL}) — verbatim outputs

${claudeMd}

---

## 2. Google AI Overviews (DataForSEO) — status

${dfsStatus}

${dfsMd}
`;

  await writeFile(outPath, content, "utf8");
  console.log(`\nWrote raw output to ${outPath}`);
  console.log(`Total DataForSEO spend this run: $${totalCost.toFixed(4)}`);
  console.log(
    anyAiOverview
      ? "Google AI Overviews data was found — update ENGINES_SHIPPED and the data registry to include it."
      : "No Google AI Overview data found — leave ENGINES_SHIPPED as Claude-only.",
  );
  console.log(
    "\nNext step (manual/LLM-assisted): normalize brand names, score appearances, and update " +
      "src/lib/seo/ai-reco-index-data.ts with the new dated snapshot.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
