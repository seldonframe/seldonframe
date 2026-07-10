// /charts/ai-front-office-trends.md — Markdown twin of the AI Front Office
// Chart. Renders the trend registry as a table (agents reading this must be
// able to tell instantly that the chart is opinion, not research) plus the
// two disclaimers verbatim.
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";
import { TRENDS, TREND_CHART_LAST_UPDATED, isProjection } from "@/lib/seo/trend-chart-data";

export const dynamic = "force-dynamic";

function currentValue(points: { year: number; value: number }[]): number {
  // The 2026 point if present, otherwise the last non-projection point.
  const at2026 = points.find((p) => p.year === 2026);
  if (at2026) return at2026.value;
  const solid = points.filter((p) => !isProjection(p));
  return solid[solid.length - 1]?.value ?? points[points.length - 1]?.value ?? 0;
}

function renderMarkdown(): string {
  const rows = TRENDS.map((t) => {
    const value2026 = currentValue(t.points);
    const take = t.take.replace(/\|/g, "\\|").replace(/\n/g, " ");
    return `| ${t.label} | ${t.status} | ${value2026} | ${take} |`;
  }).join("\n");

  return `# The AI Front Office Chart

**This is completely subjective.** Every line on this chart is Maxime Houle's belief, not a research finding. He runs
a company in this space (SeldonFrame), so he's biased — that's disclosed up front instead of hidden behind a
methodology section.

**This chart keeps getting updated.** As his thinking changes, the curves change — it's a living document, not a
one-time snapshot. Last updated: ${TREND_CHART_LAST_UPDATED}.

Is this data or opinion? **Opinion, loudly.** Not a survey, not a market study — one founder's read on where each
trend sits, visualized as a curve.

## Trends

| Trend | Status | 2026 value (0-100, subjective) | Take |
| --- | --- | --- | --- |
${rows}

Values are 0-100 subjective "attention/adoption" scores on each trend's curve, not measured market data. Full
interactive chart with hover detail and rising/declining filters: https://www.seldonframe.com/charts/ai-front-office-trends

Suggest a trend or disagree with a placement: https://x.com/seldonframe
`;
}

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/charts/ai-front-office-trends.md" });
  const md = renderMarkdown();
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/charts/ai-front-office-trends>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
