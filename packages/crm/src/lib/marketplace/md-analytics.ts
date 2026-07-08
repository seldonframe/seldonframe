// Server-side analytics for the agent-Markdown / GEO surface (design doc
// technique #6: "AI crawlers don't run JS — must be server-side. This is how we
// know any of it works.").
//
// Client analytics are useless here: GPTBot/ClaudeBot/PerplexityBot and the
// "paste a URL into ChatGPT" fetchers never execute page JS, so the ONLY
// reliable signal that the `.md` twins / `llms.txt` / negotiated-Markdown flips
// are being read is a server-side log keyed on `User-Agent` + `Referer`.
//
// Two pieces:
//   • classifyAiRequest({ userAgent, referer }) — a PURE function (no I/O, no
//     Next) that tags a request as coming from a known AI crawler (by UA) and/or
//     an AI host (by referrer). Unit-tested with plain fixtures.
//   • logMarkdownFetch(req, { surface, mode }) — a best-effort adapter that
//     pulls UA/Referer off a Request, classifies, and emits ONE structured
//     `console.info` JSON line (`action:"md_fetch"`), queryable from the Vercel
//     logs. NEVER throws, NEVER blocks the response (wrapped in try/catch).
//
// Why a structured log (not a DB row) is the deliverable: these are anonymous
// public-page hits with no org/tenant, so the org-scoped product-analytics sink
// (seldonframe_events / trackEvent) isn't the right home and would add a DB write
// to a hot, cacheable, crawler-hammered path. The log line is grep-able by
// `action:"md_fetch"` and can be shipped to any drain later. (If a non-org event
// sink is ever wanted, wire it inside logMarkdownFetch — the classification is
// already computed here.)

/** Which agent-Markdown surface produced this fetch (for grouping in queries). */
export type MarkdownSurface =
  | "marketplace_index" // /marketplace.md  (catalog)
  | "marketplace_listing" // /marketplace/<slug>.md
  | "ai_agents_index" // /ai-agents.md  (library hub)
  | "ai_agents_listing" // /ai-agents/<job>[.../for/<vertical>].md
  | "index" // /index.md  (conventional root markdown → redirect)
  | "home" // /home.md  (marketing homepage as markdown)
  | "llms_txt" // /llms.txt  (the GEO map)
  | "robots_txt" // /robots.txt
  | "alternative_page" // /alternative-to-<slug>.md  (competitor comparison twin)
  | "compare_page" // /compare/<a>-vs-<b>.md  (head-to-head twin)
  | "sf_vs_page" // /compare/seldonframe-vs-<slug>.md  (SeldonFrame head-to-head twin)
  | "best_page"; // /best/<category>-for-<audience>.md  (best-of listicle twin)

/**
 * How the Markdown was requested:
 *   • "explicit_md"     — an explicit `.md` (or `.txt`) URL was fetched.
 *   • "accept_negotiated" — an HTML page URL flipped to Markdown because the
 *                           client's `Accept` explicitly preferred text/markdown
 *                           (the proxy rewrite). This is the high-signal case:
 *                           a real agent that speaks `Accept: text/markdown`.
 */
export type MarkdownFetchMode = "explicit_md" | "accept_negotiated";

/** The known AI crawler User-Agent tokens (substring, case-insensitive). The
 *  value is the canonical bot name we record. Kept deliberately small + the
 *  big-six the design doc names, plus a couple obvious siblings; extend freely. */
const AI_CRAWLER_UA: ReadonlyArray<readonly [token: string, name: string]> = [
  ["gptbot", "GPTBot"], // OpenAI crawler
  ["oai-searchbot", "OAI-SearchBot"], // OpenAI SearchGPT
  ["chatgpt-user", "ChatGPT-User"], // ChatGPT "browse"/user-triggered fetch
  ["claudebot", "ClaudeBot"], // Anthropic crawler
  ["claude-web", "Claude-Web"], // Anthropic user-triggered fetch
  ["anthropic-ai", "Anthropic-AI"], // Anthropic (legacy token)
  ["perplexitybot", "PerplexityBot"], // Perplexity crawler
  ["perplexity-user", "Perplexity-User"], // Perplexity user-triggered fetch
  ["bytespider", "Bytespider"], // ByteDance/TikTok
  ["google-extended", "Google-Extended"], // Google AI (Gemini/Vertex) opt-in token
  ["googleother", "GoogleOther"], // Google non-search crawl (incl. AI uses)
  ["ccbot", "CCBot"], // Common Crawl (feeds many LLMs)
  ["cohere-ai", "Cohere-AI"],
  ["cohere-training-data-crawler", "Cohere"],
  ["meta-externalagent", "Meta-ExternalAgent"], // Meta AI
  ["applebot-extended", "Applebot-Extended"], // Apple AI opt-in token
  ["amazonbot", "Amazonbot"],
  ["youbot", "YouBot"], // You.com
  ["diffbot", "Diffbot"],
  ["timpibot", "Timpibot"],
] as const;

/** Known AI host referrers (substring of the referrer hostname, case-insensitive).
 *  The value is the canonical host we record. Covers the "human pasted a URL into
 *  the assistant" flow, where the fetch's Referer is the assistant's web origin. */
const AI_REFERRER_HOST: ReadonlyArray<readonly [token: string, name: string]> = [
  ["chatgpt.com", "chatgpt.com"],
  ["chat.openai.com", "chat.openai.com"],
  ["claude.ai", "claude.ai"],
  ["perplexity.ai", "perplexity.ai"],
  ["gemini.google.com", "gemini.google.com"],
  ["bard.google.com", "bard.google.com"],
  ["copilot.microsoft.com", "copilot.microsoft.com"],
  ["bing.com/chat", "bing.com"],
  ["you.com", "you.com"],
  ["poe.com", "poe.com"],
  ["phind.com", "phind.com"],
] as const;

export interface AiClassification {
  /** Canonical bot name when the UA is a known AI crawler, else null. */
  aiCrawler: string | null;
  /** Canonical host when the referrer is a known AI host, else null. */
  aiReferrer: string | null;
  /** True when EITHER signal fired — the coarse "this is AI traffic" flag. */
  isAi: boolean;
}

/** Lowercase a maybe-null header value once (trim too), or "" when absent. */
function norm(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

/**
 * Classify a request as AI traffic by its User-Agent (known crawler) and/or its
 * Referer (known AI host). PURE — no I/O. Both inputs are optional/nullable so it
 * is trivially callable with raw header reads.
 *
 *   classifyAiRequest({ userAgent: "GPTBot/1.0" })
 *     → { aiCrawler: "GPTBot", aiReferrer: null, isAi: true }
 *   classifyAiRequest({ referer: "https://chatgpt.com/" })
 *     → { aiCrawler: null, aiReferrer: "chatgpt.com", isAi: true }
 *   classifyAiRequest({ userAgent: "Mozilla/5.0 …Chrome…" })
 *     → { aiCrawler: null, aiReferrer: null, isAi: false }
 */
export function classifyAiRequest(input: {
  userAgent?: string | null;
  referer?: string | null;
}): AiClassification {
  const ua = norm(input.userAgent);
  const ref = norm(input.referer);

  let aiCrawler: string | null = null;
  if (ua) {
    for (const [token, name] of AI_CRAWLER_UA) {
      if (ua.includes(token)) {
        aiCrawler = name;
        break;
      }
    }
  }

  let aiReferrer: string | null = null;
  if (ref) {
    for (const [token, name] of AI_REFERRER_HOST) {
      if (ref.includes(token)) {
        aiReferrer = name;
        break;
      }
    }
  }

  return { aiCrawler, aiReferrer, isAi: Boolean(aiCrawler || aiReferrer) };
}

/** The shape of the structured log line (also the contract a future drain reads). */
export interface MarkdownFetchLogLine {
  action: "md_fetch";
  surface: MarkdownSurface;
  mode: MarkdownFetchMode;
  /** The request path (pathname only — no query, no host). */
  path: string;
  userAgent: string | null;
  referer: string | null;
  aiCrawler: string | null;
  aiReferrer: string | null;
  isAi: boolean;
}

/** Read a header off either a web `Request` or a `Headers`-bearing object. */
function readHeader(req: { headers: Headers }, name: string): string | null {
  try {
    return req.headers.get(name);
  } catch {
    return null;
  }
}

/** Best-effort pathname extraction (web Request carries an absolute `url`). */
function readPath(req: { url?: string }): string {
  if (!req.url) return "";
  try {
    return new URL(req.url).pathname;
  } catch {
    return "";
  }
}

/**
 * Emit ONE structured `console.info` JSON line for a Markdown/GEO fetch so AI
 * traffic is measurable from the server logs (grep `action:"md_fetch"`).
 *
 * BEST-EFFORT BY CONTRACT: fully wrapped in try/catch — it must NEVER throw and
 * NEVER block the response. Call it and ignore it; the fetch proceeds regardless.
 *
 * Accepts the standard web `Request` the route handlers receive (it only needs
 * `.headers` + `.url`), so callers pass `req` straight through. When a caller has
 * no Request (a header-only context), pass `{ headers }` and optionally `{ url }`.
 */
export function logMarkdownFetch(
  req: { headers: Headers; url?: string },
  meta: { surface: MarkdownSurface; mode: MarkdownFetchMode; path?: string },
): void {
  try {
    const userAgent = readHeader(req, "user-agent");
    const referer = readHeader(req, "referer") ?? readHeader(req, "referrer");
    const { aiCrawler, aiReferrer, isAi } = classifyAiRequest({ userAgent, referer });

    const line: MarkdownFetchLogLine = {
      action: "md_fetch",
      surface: meta.surface,
      mode: meta.mode,
      path: meta.path ?? readPath(req),
      userAgent,
      referer,
      aiCrawler,
      aiReferrer,
      isAi,
    };

    console.info(JSON.stringify(line));
  } catch {
    // Never let measurement break a content response. Swallow everything.
  }
}
