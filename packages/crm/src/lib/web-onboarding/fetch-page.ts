// packages/crm/src/lib/web-onboarding/fetch-page.ts
//
// Server-side HTML fetch helper for the web-onboarding pipeline.
//
// Why this exists (2026-05-16): we are replacing the Anthropic web_fetch
// tool path (web-fetch-extractor.ts) with a thin server-side fetch ->
// HTML->MD -> LLM pipeline. The Anthropic tool path locks us into
// Anthropic-only, can't handle JS-only sites, returns raw HTML to the
// model (wasting tokens), and frequently triggered conversational
// preambles ("I'll fetch the homepage..."). This module owns the
// HTTP fetch concern. Pure function. No external deps. Fully testable
// via a `fetchImpl` injection seam.

export type FetchPageReason =
  | "network_error"
  | "timeout"
  | "non_html"
  | `http_error_${number}`;

export type FetchPageResult =
  | { ok: true; html: string; url: string; contentType: string }
  | { ok: false; reason: FetchPageReason };

// 10s — long enough for slow agency sites on shared hosting, short enough
// that the SSE flow doesn't appear hung to the operator. Twilio's webhook
// timeout (10s) is the industry convention we mirror.
const DEFAULT_TIMEOUT_MS = 10_000;

// Real browser UA. Empty UA is rejected by Cloudflare's bot fight mode and
// many WAFs; "node-fetch/x.y.z" gets explicitly blocked by Akamai/AWS WAF.
// Generic Chrome UA passes through ~99% of agency sites.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Fetch a URL and return its HTML body, or a typed reason if the fetch
 * fails. Follows up to 5 redirects (native fetch default).
 *
 * Reason codes are stable so callers can branch on them without parsing
 * the raw error message:
 *   - network_error  -> DNS failure, connection reset, TLS error, etc.
 *   - timeout        -> AbortController fired after timeoutMs
 *   - http_error_<n> -> server returned a non-2xx status
 *   - non_html       -> content-type wasn't text/html (e.g. application/pdf)
 */
export async function fetchPage(
  url: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<FetchPageResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: `http_error_${response.status}` as const };
    }

    const contentType = response.headers.get("content-type") ?? "";
    // text/html, application/xhtml+xml, or anything that looks HTML-ish.
    // Reject PDFs, images, JSON APIs, etc.
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return { ok: false, reason: "non_html" };
    }

    const html = await response.text();
    return { ok: true, html, url: response.url || url, contentType };
  } catch (err: unknown) {
    // AbortError name comes through both for caller-initiated aborts and
    // for our own timeout. Either way the actionable signal is "timeout".
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
