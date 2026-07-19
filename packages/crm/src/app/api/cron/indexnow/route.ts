// /api/cron/indexnow — weekly IndexNow sweep: submits every sitemap URL to
// Bing/Yandex/Naver so new + updated SEO pages index in minutes, not weeks
// (Bing feeds Copilot/ChatGPT search/DuckDuckGo — the GEO fast lane).
// Copies the CRON_SECRET fail-closed auth shape of api/cron/usage-caps.
// Registered in vercel.json at "0 8 * * 1" (Mondays 08:00 UTC). ?dryRun=1
// lists what would be submitted without pinging.

import sitemap from "@/app/sitemap";
import { submitToIndexNow } from "@/lib/seo/indexnow";

export const runtime = "nodejs";

let warnedMissingSecret = false;

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    if (!warnedMissingSecret) {
      console.warn("[indexnow] CRON_SECRET is unset — fail-closed, denying all requests.");
      warnedMissingSecret = true;
    }
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const entries = await sitemap();
  const urls = entries.map((e) => e.url);

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  if (dryRun) {
    return Response.json({ ok: true, dryRun: true, wouldSubmit: urls.length, sample: urls.slice(0, 5) });
  }

  const result = await submitToIndexNow(urls);
  console.log(
    JSON.stringify({ action: "indexnow_sweep", submitted: result.submitted, chunks: result.chunks, ok: result.ok }),
  );
  return Response.json({ ok: result.ok, submitted: result.submitted, chunks: result.chunks });
}
