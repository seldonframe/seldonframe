// /charts/missed-revenue-decay.md — Markdown twin of the Lead Decay Curve
// chart page. Renders the sourced data table + honesty notes as plain
// Markdown (the agent-legible representation), mirroring guide-markdown.ts.
import { AUTHOR } from "@/components/seo/author-byline";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";
import { DECAY_POINTS, INDUSTRY_MARKERS, SOURCES } from "@/lib/seo/lead-decay-data";

export const dynamic = "force-dynamic";

const BASE = "https://www.seldonframe.com";
const LAST_UPDATED = "July 2026";

function renderMarkdown(): string {
  const L: string[] = [];

  L.push("# The Lead Decay Curve — What Happens to a Lead While You Don't Reply");
  L.push("");
  L.push(
    "> An interactive chart of what slow follow-up costs a service business, minute by minute — sourced from lead-response research, with an industry marker and a revenue-at-risk calculator.",
  );
  L.push("");
  L.push(`Reviewed by ${AUTHOR.name}, ${AUTHOR.role}. Facts checked ${LAST_UPDATED}.`);
  L.push("");
  L.push(`HTML version: ${BASE}/charts/missed-revenue-decay`);
  L.push("");

  L.push("## What this chart shows");
  L.push("");
  L.push(
    "A new lead who reaches out is usually reaching out to more than one business at once. Lead-response research keeps finding the same pattern: the odds of reaching and qualifying a lead are highest immediately after they contact you, and fall off fast the longer you wait. Every point below is a real, sourced comparison — not a smoothed guess. Where the literature has no data point, the gap is marked explicitly rather than papered over with an invented curve.",
  );
  L.push("");

  L.push("## The data points, with sources");
  L.push("");
  L.push("| Time since inquiry | Relative odds (indexed to 100 at ~5 min) | Source |");
  L.push("| --- | --- | --- |");
  for (const p of DECAY_POINTS) {
    const src = SOURCES[p.sourceKey];
    L.push(`| ${p.label} | ${p.index} | [${src.label}](${src.url}) |`);
  }
  L.push("");
  L.push(
    "**Unsourced gap:** no data point exists between 30 minutes and 24 hours in the cited study — the chart draws this segment dashed, not solid. The same study separately notes qualification success fell \"over sixfold\" within the first hour overall, but that is a coarser, differently-scoped stat than the 30-minute point and is not plotted as its own point on this curve.",
  );
  L.push("");

  L.push("## Industry markers (illustrative, not sourced benchmarks)");
  L.push("");
  L.push(
    "No trustworthy numeric per-industry response-time table exists in the public research (see our guide on why average lead response time by industry is unreliable). The markers below are an illustrative placement only:",
  );
  L.push("");
  L.push("| Industry | Illustrative typical response time |");
  L.push("| --- | --- |");
  for (const i of INDUSTRY_MARKERS) {
    L.push(`| ${i.name} | ~${i.typicalResponseMinutes} min |`);
  }
  L.push("");

  L.push("## What this doesn't prove");
  L.push("");
  L.push(
    "- This is correlational data, not a controlled experiment — it can't prove responding faster *causes* more sales for every business, only that faster responders connected and qualified more often in the studies measured.",
  );
  L.push(
    "- The underlying data is old — the Lead Response Management figures come from a multi-year study whose data collection predates 2011, and the Harvard Business Review analysis by the same researcher (James Oldroyd) was published in 2011.",
  );
  L.push(
    "- The exact multipliers (4x, 21x, 6x) come from a single vendor-hosted study across six companies — not a peer-reviewed, replicated result. Treat the direction as reliable and the exact numbers as illustrative.",
  );
  L.push("- The industry markers are illustrative placements, not sourced per-industry benchmarks.");
  L.push("");

  L.push("## Sources");
  L.push("");
  for (const key of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) {
    const src = SOURCES[key];
    L.push(`- [${src.label}](${src.url}) — ${src.note}`);
  }
  L.push("");

  L.push("## Try it");
  L.push("");
  L.push(`- Related free tool: ${BASE}/tools/speed-to-lead-calculator`);
  L.push(`- Also see: ${BASE}/tools/missed-call-calculator`);
  L.push(`- Go deeper: ${BASE}/guides/what-is-speed-to-lead`);
  L.push(`- Build your AI front office free (about 3 minutes): ${BASE}/signup`);
  L.push("");

  return L.join("\n");
}

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/charts/missed-revenue-decay.md" });
  const md = renderMarkdown();
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/charts/missed-revenue-decay>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
