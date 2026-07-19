// /charts/ai-recommendation-index.md — Markdown twin of the AI
// Recommendation Index. Renders the full leaderboard table + methodology +
// a pointer to the raw-output archive so an agent/LLM reading this can
// audit every scored point without loading the interactive page.
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";
import {
  QUESTIONS,
  SNAPSHOT_DATE,
  SNAPSHOT_LABEL,
  METHODOLOGY,
  ENGINES_SHIPPED,
  buildLeaderboard,
} from "@/lib/seo/ai-reco-index-data";

export const dynamic = "force-dynamic";

function renderMarkdown(): string {
  const leaderboard = buildLeaderboard();
  const rows = leaderboard
    .map((row, i) => {
      const questions = row.appearances
        .map((a) => `${QUESTIONS.find((q) => q.id === a.questionId)?.text} (#${a.rank})`)
        .join("; ");
      return `| ${i + 1} | ${row.brand} | ${row.score} | ${row.questionCount} | ${questions.replace(/\|/g, "\\|")} |`;
    })
    .join("\n");

  const questionList = QUESTIONS.map((q, i) => `${i + 1}. ${q.text}`).join("\n");

  return `# The AI Recommendation Index — ${SNAPSHOT_LABEL} snapshot

Which software brands does AI actually recommend for small-service-business jobs? 10 fixed buyer questions, run
through Claude, scored into a ranked leaderboard. Engines shipped in this snapshot: ${ENGINES_SHIPPED.join(", ")}.

**Answers vary run to run.** This is a snapshot (n=1 per question), not a benchmark.

**Self-interest, disclosed:** SeldonFrame builds one of the tools these questions are about. SeldonFrame did not
appear in any of the 10 Claude answers in this snapshot — published as-is, not nudged.

## Leaderboard (overall)

| Rank | Brand | Score | Questions | Appeared in |
| --- | --- | --- | --- | --- |
${rows}

Score = sum over appearances of (6 - rank): a #1 mention is worth 5 points, a #5 mention is worth 1 point. Brand
names are normalized before scoring (e.g. "GoHighLevel" / "HighLevel" / "GHL" collapse to one brand).

## The 10 fixed questions

${questionList}

## Methodology

- **Claude column:** each question run once through \`${METHODOLOGY.claudeModel}\` with the suffix "Answer with a
  ranked list of up to 5 specific products and one line why each." ${METHODOLOGY.claudeSampling}.
- **Google AI Overviews column:** ${METHODOLOGY.googleAiOverviewStatus}
- **Scoring:** ${METHODOLOGY.scoring}.
- ${METHODOLOGY.caveat}

Full verbatim raw outputs for this snapshot: https://github.com/seldonframe (see
${METHODOLOGY.rawOutputsPath} in the SeldonFrame repo) — every scored point traces back to a specific raw answer.

Snapshot date: ${SNAPSHOT_DATE}. Full interactive leaderboard with category/engine filters:
https://www.seldonframe.com/charts/ai-recommendation-index

Per-business version: https://www.seldonframe.com/tools/ai-visibility-checker
`;
}

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/charts/ai-recommendation-index.md" });
  const md = renderMarkdown();
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/charts/ai-recommendation-index>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
