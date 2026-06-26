// /ai-agents.md — the clean-Markdown twin of the /ai-agents agent-library hub.
//
// Explicit `.md` URL → ALWAYS Markdown (no Accept negotiation; the proxy only
// negotiates the HTML page). Rendered from the SAME registry the HTML page reads
// (AGENT_JOBS → renderAiAgentsIndexMarkdown), so it can never drift.
//
// Vary: Accept + a Link rel="alternate" back to the HTML page declare the twin
// to CDNs and crawlers — exactly the dual-representation pattern M1's
// /marketplace.md uses (the HTML page advertises the .md; the .md points back).

import { AGENT_JOBS } from "@/lib/seo/agent-pages";
import {
  renderAiAgentsIndexMarkdown,
  aiAgentsIndexUrl,
} from "@/lib/marketplace/render-ai-agents-markdown";

export const dynamic = "force-static";

export function GET(): Response {
  const md = renderAiAgentsIndexMarkdown(AGENT_JOBS);

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      Link: `<${aiAgentsIndexUrl()}>; rel="alternate"; type="text/html"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
