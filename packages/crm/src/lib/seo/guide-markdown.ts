// Pure Markdown renderer for the /guides/<slug>.md twins — the agent-legible
// representation of the long-form articles, mirroring best-markdown.ts. Served
// by the static dotted route folders (app/guides/<slug>.md/route.ts).

import { getGuide, LAST_UPDATED } from "./guides";
import { AUTHOR } from "@/components/seo/author-byline";
import type { GuideCallout, GuideDiagram, GuideDiagramItem } from "./guides/types";
import { startsWithKindOfLike } from "./guide-inline";

const BASE = "https://www.seldonframe.com";

const CALLOUT_EMOJI: Record<GuideCallout["kind"], string> = {
  analogy: "💡",
  tip: "💡",
  warning: "⚠️",
};
const CALLOUT_LABEL: Record<GuideCallout["kind"], string> = {
  analogy: "Kind of like",
  tip: "Tip",
  warning: "Watch out",
};

/** Degrade a callout to a Markdown blockquote line. Guards against
 *  doubling up ("Kind of like: It's kind of like…") when the analogy text
 *  itself already opens with "kind of like" / "it's kind of like". */
function renderCalloutMarkdown(c: GuideCallout): string {
  if (c.kind === "analogy" && startsWithKindOfLike(c.text)) {
    return `> ${CALLOUT_EMOJI[c.kind]} ${c.text}`;
  }
  return `> ${CALLOUT_EMOJI[c.kind]} ${CALLOUT_LABEL[c.kind]}: ${c.text}`;
}

function itemLabel(item: GuideDiagramItem): string {
  return item.sub ? `${item.label} (${item.sub})` : item.label;
}

/** Degrade a typed diagram to a plain-text block under a bold title line. */
function renderDiagramMarkdown(d: GuideDiagram): string {
  const lines: string[] = [];
  switch (d.type) {
    case "flow": {
      lines.push(`**${d.title ?? "Flow"}**`);
      lines.push("");
      lines.push(d.steps.map(itemLabel).join(" → "));
      break;
    }
    case "loop": {
      lines.push(`**${d.title ?? "Loop"}**`);
      lines.push("");
      lines.push(`${d.steps.join(" → ")} → back to ${d.steps[0]}`);
      break;
    }
    case "compare": {
      lines.push(`**${d.title ?? "Comparison"}**`);
      lines.push("");
      lines.push(`${d.left.heading}:`);
      for (const item of d.left.items) lines.push(`- ${item}`);
      lines.push("");
      lines.push(`${d.right.heading}:`);
      for (const item of d.right.items) lines.push(`- ${item}`);
      break;
    }
    case "bars": {
      lines.push(`**${d.title ?? "Comparison"}**`);
      lines.push("");
      for (const item of d.items) lines.push(`- ${item.label}: ${item.display}`);
      if (d.note) {
        lines.push("");
        lines.push(d.note);
      }
      break;
    }
    case "stack": {
      lines.push(`**${d.title ?? "Layers"}**`);
      lines.push("");
      d.layers.forEach((layer, i) => lines.push(`${i + 1}. ${itemLabel(layer)}`));
      break;
    }
  }
  return lines.join("\n");
}

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
    if (s.callout) {
      L.push(renderCalloutMarkdown(s.callout));
      L.push("");
    }
    if (s.diagram) {
      L.push(renderDiagramMarkdown(s.diagram));
      L.push("");
    }
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
