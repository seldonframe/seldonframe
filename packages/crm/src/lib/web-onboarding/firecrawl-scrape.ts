// packages/crm/src/lib/web-onboarding/firecrawl-scrape.ts
//
// Thin wrapper around the Firecrawl `/scrape` endpoint (@mendable/firecrawl-js
// v2 SDK, default class export). Replaces the in-process fetch + HTML->MD
// path because plain server-side fetch() from Vercel egress IPs gets 403'd
// by Cloudflare bot fight mode on basically every real agency site. Firecrawl
// runs a real browser fingerprint behind rotating proxies and hands us
// clean Markdown directly.
//
// To swap to a different scraper (Browserless, ScrapingBee, Bright Data),
// only this file changes — markdown-extractor.ts stays.
//
// Pure function modulo network IO. Fully testable via the `firecrawlClient`
// injection seam.

import Firecrawl from "@mendable/firecrawl-js";

export type FirecrawlScrapeReason =
  | "not_configured"
  | "fetch_failed"
  | "empty_content"
  | "timeout"
  | "rate_limited";

export type FirecrawlScrapeResult =
  | { ok: true; markdown: string; finalUrl: string; title?: string }
  | { ok: false; reason: FirecrawlScrapeReason; detail?: string };

/**
 * Subset of the v2 SDK we depend on. Returning `unknown` lets tests stub
 * the client without having to construct a full `Document` from the SDK
 * type universe. The wrapper does the structural read defensively.
 */
export type FirecrawlClientLike = {
  scrape: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
};

export type ScrapeDeps = {
  /** Test seam — production uses a real Firecrawl instance. */
  firecrawlClient?: FirecrawlClientLike;
};

// Below this we treat the response as a blank page / anti-bot challenge /
// JS-only SPA shell — none of which carry enough signal for the LLM
// extractor. Mirrors MIN_MD_CHARS in markdown-extractor.ts (200 = "heading
// + a paragraph" floor).
const MIN_MARKDOWN_CHARS = 200;

// Per-scrape budget. Firecrawl's own default is 30s for /scrape; we set
// the SDK's timeout option explicitly so we don't depend on whatever the
// upstream default is on any given SDK version.
const TIMEOUT_MS = 30_000;

/**
 * Document shape we read from the SDK response. Keep this minimal so an
 * SDK metadata-field addition doesn't break us; we only need markdown +
 * the final URL + the title.
 */
type DocumentLike = {
  markdown?: string;
  metadata?: {
    sourceURL?: string;
    url?: string;
    title?: string;
    statusCode?: number;
    error?: string;
  };
};

function classifyError(detail: string): FirecrawlScrapeReason {
  if (/timeout|timed out/i.test(detail)) return "timeout";
  if (/rate.?limit|429/i.test(detail)) return "rate_limited";
  return "fetch_failed";
}

export async function firecrawlScrape(
  url: string,
  deps: ScrapeDeps = {},
): Promise<FirecrawlScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  // Self-host support — operators running their own Firecrawl instance
  // (Docker / Railway / Fly / VPS) set FIRECRAWL_API_URL to their host's
  // base URL (e.g. "https://firecrawl.your-domain.com" or "http://localhost:3002"
  // for local dev). When unset, the SDK defaults to the hosted SaaS at
  // api.firecrawl.dev. The self-hosted Firecrawl image accepts any string
  // as apiKey (auth is at the network layer), so a self-hoster can set
  // FIRECRAWL_API_KEY=local-dev or similar.
  const apiUrl = process.env.FIRECRAWL_API_URL?.trim();
  if (!apiKey && !deps.firecrawlClient) {
    return {
      ok: false,
      reason: "not_configured",
      detail: "FIRECRAWL_API_KEY env var not set",
    };
  }

  const client: FirecrawlClientLike =
    deps.firecrawlClient ??
    new Firecrawl({
      apiKey: apiKey ?? "",
      // Only pass apiUrl when set so the SaaS default still applies
      // when the operator hasn't opted into self-hosting.
      ...(apiUrl ? { apiUrl } : {}),
    });

  let doc: DocumentLike;
  try {
    doc = (await client.scrape(url, {
      formats: ["markdown"],
      // Keep header/footer/nav — business facts (phone, address, hours,
      // "Family-owned since 1998") frequently live there, not in <main>.
      onlyMainContent: false,
      timeout: TIMEOUT_MS,
    })) as DocumentLike;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "firecrawl_scrape_threw",
        url,
        message: message.slice(0, 300),
      }),
    );
    return {
      ok: false,
      reason: classifyError(message),
      detail: message.slice(0, 200),
    };
  }

  // Defensive: SDK could in principle return null/undefined or an empty
  // object on a degenerate path; treat that the same as a fetch failure.
  if (!doc || typeof doc !== "object") {
    console.warn(
      JSON.stringify({
        event: "firecrawl_scrape_no_document",
        url,
      }),
    );
    return {
      ok: false,
      reason: "fetch_failed",
      detail: "Firecrawl returned no document",
    };
  }

  // metadata.error is how Firecrawl surfaces an upstream failure without
  // throwing (some scrape paths return 200 + metadata.error).
  const upstreamError = doc.metadata?.error;
  if (upstreamError) {
    console.warn(
      JSON.stringify({
        event: "firecrawl_scrape_upstream_error",
        url,
        status: doc.metadata?.statusCode ?? null,
        detail: upstreamError.slice(0, 300),
      }),
    );
    return {
      ok: false,
      reason: classifyError(upstreamError),
      detail: upstreamError.slice(0, 200),
    };
  }

  const markdown = doc.markdown?.trim() ?? "";
  if (markdown.length < MIN_MARKDOWN_CHARS) {
    console.warn(
      JSON.stringify({
        event: "firecrawl_scrape_empty_markdown",
        url,
        md_chars: markdown.length,
        status: doc.metadata?.statusCode ?? null,
      }),
    );
    return {
      ok: false,
      reason: "empty_content",
      detail: `Got ${markdown.length} chars of MD`,
    };
  }

  return {
    ok: true,
    markdown,
    // Firecrawl's metadata uses sourceURL for the scraped URL; some SDK
    // revisions populate `url` instead. Fall back through both before
    // defaulting to the input URL.
    finalUrl: doc.metadata?.sourceURL ?? doc.metadata?.url ?? url,
    title: doc.metadata?.title,
  };
}
