// Pure Markdown renderer for the /guides/<slug>.md twins — the agent-legible
// representation of the long-form articles, mirroring best-markdown.ts. Served
// by the static dotted route folders (app/guides/<slug>.md/route.ts).

import { getGuide, LAST_UPDATED } from "./guides";
import { AUTHOR } from "@/components/seo/author-byline";

const BASE = "https://www.seldonframe.com";

export function renderGuideMarkdown(slug: string): string {
  const g = getGuide(slug);
  const L: string[] = [];

  L.push(`# ${g.title}`);
  L.push("");
  L.push(`> ${g.dek}`);
  L.push("");
  L.push(`Reviewed by ${AUTHOR.name}, ${AUTHOR.role}. Facts checked ${LAST_UPDATED}.`);
  L.push("");
  L.push(`HTML version: ${BASE}/guides/${slug}`);
  L.push("");

  for (const s of g.sections) {
    L.push(`## ${s.h2}`);
    L.push("");
    L.push(s.body);
    L.push("");
  }

  L.push("## FAQ");
  L.push("");
  for (const f of g.faq) {
    L.push(`**${f.q}**`);
    L.push("");
    L.push(f.a);
    L.push("");
  }

  L.push("## Try it");
  L.push("");
  L.push(`- Related free tool: ${BASE}${g.relatedTool}`);
  if (g.relatedChart) L.push(`- ${g.relatedChart.label}: ${BASE}${g.relatedChart.href}`);
  if (g.relatedBest) L.push(`- Go deeper: ${BASE}${g.relatedBest}`);
  L.push(`- Build your AI front office free (about 3 minutes): ${BASE}/signup`);
  L.push("");

  if (g.sources.length > 0) {
    L.push("## Sources");
    L.push("");
    for (const src of g.sources) L.push(`- [${src.label}](${src.url})`);
    L.push("");
  }

  return L.join("\n");
}
