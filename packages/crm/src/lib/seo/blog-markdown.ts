// Pure Markdown renderer for the /blog/<slug>.md twins — the agent-legible
// representation of the long-form blog articles, mirroring guide-markdown.ts.
// Served by the static dotted route folders (app/blog/<slug>.md/route.ts).

import { getBlogArticle } from "./blog";
import { AUTHOR } from "@/components/seo/author-byline";
import type { BlogCallout } from "./blog/types";
import { startsWithKindOfLike } from "./guide-inline";

const BASE = "https://www.seldonframe.com";

const CALLOUT_EMOJI: Record<BlogCallout["kind"], string> = {
  analogy: "💡",
  tip: "💡",
  warning: "⚠️",
};
const CALLOUT_LABEL: Record<BlogCallout["kind"], string> = {
  analogy: "Kind of like",
  tip: "Tip",
  warning: "Watch out",
};

/** Degrade a callout to a Markdown blockquote line. Guards against
 *  doubling up ("Kind of like: It's kind of like…") when the analogy text
 *  itself already opens with "kind of like" / "it's kind of like". */
function renderCalloutMarkdown(c: BlogCallout): string {
  if (c.kind === "analogy" && startsWithKindOfLike(c.text)) {
    return `> ${CALLOUT_EMOJI[c.kind]} ${c.text}`;
  }
  return `> ${CALLOUT_EMOJI[c.kind]} ${CALLOUT_LABEL[c.kind]}: ${c.text}`;
}

/** Never emit undefined/null into the twin — every optional field is guarded. */
export function renderBlogMarkdown(slug: string): string {
  const a = getBlogArticle(slug);
  const L: string[] = [];
  const author = a.author ?? AUTHOR.name;

  L.push(`# ${a.title}`);
  L.push("");
  L.push(`> ${a.dek}`);
  L.push("");
  L.push(`By ${author}. Published ${a.date}.`);
  L.push("");
  if (a.sourceVideo) {
    const ts = a.sourceVideo.timestamp ? ` (${a.sourceVideo.timestamp})` : "";
    L.push(`Source: [${a.sourceVideo.title}](${a.sourceVideo.url}) — ${a.sourceVideo.channel}${ts}`);
    L.push("");
  }
  L.push(`HTML version: ${BASE}/blog/${slug}`);
  L.push("");

  for (const s of a.sections) {
    L.push(`## ${s.h2}`);
    L.push("");
    L.push(s.body);
    L.push("");
    if (s.callout) {
      L.push(renderCalloutMarkdown(s.callout));
      L.push("");
    }
  }

  if (a.faq && a.faq.length > 0) {
    L.push("## FAQ");
    L.push("");
    for (const f of a.faq) {
      L.push(`**${f.q}**`);
      L.push("");
      L.push(f.a);
      L.push("");
    }
  }

  if (a.relatedTool || a.relatedGuide) {
    L.push("## Related");
    L.push("");
    if (a.relatedTool) L.push(`- Related free tool: ${BASE}${a.relatedTool}`);
    if (a.relatedGuide) L.push(`- Go deeper: ${BASE}${a.relatedGuide}`);
    L.push("");
  }

  if (a.sources.length > 0) {
    L.push("## Sources");
    L.push("");
    for (const src of a.sources) L.push(`- [${src.label}](${src.url})`);
    L.push("");
  }

  return L.join("\n");
}
