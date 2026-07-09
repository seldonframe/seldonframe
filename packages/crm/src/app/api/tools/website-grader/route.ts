// POST /api/tools/website-grader — the flagship free tool's server-side
// fetch-and-grade endpoint. Unauthenticated, no persistence: we fetch the
// caller-supplied URL, grade it with the pure lib/seo/website-grader-checks
// logic, and return the result. Nothing is stored (see the FAQ honesty note
// on the page — "do you store my URL" -> no).
//
// SSRF posture: this is exactly the shape the security audit calls out — an
// unauthenticated route that fetches a URL the caller supplies. We reuse the
// canonical guard (fetchPublicUrlSafe), which vets the initial URL AND every
// redirect hop (loopback/private/link-local/metadata) before opening any
// socket, mirroring app/api/v1/public/analyze-url/route.ts exactly.

import { NextResponse } from "next/server";
import { fetchPublicUrlSafe, SsrfBlockedError } from "@/lib/security/ssrf-guard";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { gradeWebsite } from "@/lib/seo/website-grader-checks";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 1_500_000; // ~1.5MB cap
const FETCH_TIMEOUT_MS = 8_000;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "local";
  return forwarded.split(",")[0]?.trim() || "local";
}

/** Loosely normalize what people paste: bare domains get https://. Returns
 *  null for anything that isn't a parseable http(s) URL. */
function normalizeInputUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Read a Response body as text, aborting once MAX_BODY_BYTES is exceeded.
 *  Falls back to a plain .text() when the runtime doesn't expose a stream
 *  reader (keeps this safe across fetch polyfills / test environments). */
async function readCappedText(response: Response): Promise<string> {
  const body = response.body;
  if (!body || typeof body.getReader !== "function") {
    const text = await response.text();
    return text.slice(0, MAX_BODY_BYTES);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (received >= MAX_BODY_BYTES) {
        out = out.slice(0, MAX_BODY_BYTES);
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // best-effort — nothing to do if the reader is already closed
    }
  }
  return out;
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(`website-grader:${ip}`, RATE_LIMIT, RATE_WINDOW_MS))) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in about an hour." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const urlValue = typeof body.url === "string" ? body.url : "";
  const cleanUrl = normalizeInputUrl(urlValue);

  if (!cleanUrl) {
    return NextResponse.json({ error: "Enter a valid website URL, e.g. yourbusiness.com" }, { status: 400 });
  }

  const startedAt = Date.now();
  let response: Response;
  let finalUrl: string;
  let redirectedToHttps = false;
  try {
    response = await fetchPublicUrlSafe(
      cleanUrl,
      {
        headers: { "User-Agent": "SeldonFrameGrader/1.0 (+https://www.seldonframe.com/tools/website-grader)" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    finalUrl = response.url || cleanUrl;
    redirectedToHttps = cleanUrl.toLowerCase().startsWith("http://") && finalUrl.toLowerCase().startsWith("https://");
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return NextResponse.json(
        { error: "That URL can't be graded — it points to a private or internal address, not a public website." },
        { status: 400 },
      );
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "That site took too long to respond. Try again, or double-check the URL." },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Could not reach that URL. Make sure it's a public website and try again." },
      { status: 422 },
    );
  }

  const responseTimeMs = Date.now() - startedAt;

  if (!response.ok) {
    return NextResponse.json(
      { error: `That site responded with an error (status ${response.status}). Make sure the URL is correct.` },
      { status: 422 },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("html")) {
    return NextResponse.json(
      { error: "That URL didn't return a webpage (not HTML) — nothing to grade." },
      { status: 422 },
    );
  }

  let html: string;
  try {
    html = await readCappedText(response);
  } catch {
    return NextResponse.json(
      { error: "Could not read that page's content. Try again, or try a different URL." },
      { status: 422 },
    );
  }

  if (!html || html.trim().length === 0) {
    return NextResponse.json({ error: "That page came back empty — nothing to grade." }, { status: 422 });
  }

  const result = gradeWebsite({
    html,
    finalUrl,
    redirectedToHttps,
    responseTimeMs,
    pageBytes: html.length,
  });

  return NextResponse.json({
    url: finalUrl,
    score: result.score,
    grade: result.grade,
    checks: result.checks,
  });
}
