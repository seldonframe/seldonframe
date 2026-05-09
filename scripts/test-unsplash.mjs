// scripts/test-unsplash.mjs
//
// One-shot Unsplash API health-check. Run before creating a new workspace
// to verify (a) the access key works, (b) we're not rate-limited, (c) the
// API returns medspa-relevant results, and (d) the returned URL is reachable.
//
// Usage:
//   node scripts/test-unsplash.mjs <ACCESS_KEY>
// or
//   $env:UNSPLASH_ACCESS_KEY="..." ; node scripts/test-unsplash.mjs
//
// Mirrors the exact request shape of resolveHeroImageUrlForQuery /
// resolveGalleryImageUrlsForQueries in packages/crm/src/lib/crm/personality-images.ts
// — same per_page, same orientation, same content_filter — so what we observe
// here is what the workspace pipeline observes.

const ACCESS_KEY = process.argv[2] || process.env.UNSPLASH_ACCESS_KEY?.trim();

if (!ACCESS_KEY) {
  console.error("ERROR: pass access key as arg 1 OR set UNSPLASH_ACCESS_KEY env var");
  process.exit(1);
}

console.log(`\n==> Unsplash API health-check\n    Key starts: ${ACCESS_KEY.slice(0, 8)}...\n    Key length: ${ACCESS_KEY.length}\n`);

const tests = [
  { kind: "hero", query: "minimalist medspa treatment room", orientation: "landscape" },
  { kind: "hero", query: "serene aesthetic clinic marble", orientation: "landscape" },
  { kind: "gallery", query: "facial treatment dermatology", orientation: "squarish" },
  { kind: "gallery", query: "skincare botanical products", orientation: "squarish" },
  { kind: "hero", query: "asphalt shingle residential roof close-up", orientation: "landscape" }, // control
];

let pass = 0;
let fail = 0;
let lastRateLimit = null;

// v1.40.5 — three-tier broadening (mirrors buildQueryCandidates in
// packages/crm/src/lib/crm/personality-images.ts).
function buildQueryCandidates(query) {
  const cleaned = (query || "").trim();
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/).filter(Boolean);
  const candidates = [cleaned];
  if (words.length >= 2) candidates.push(words.slice(1).join(" "));
  if (words.length >= 3) candidates.push(words.slice(-2).join(" "));
  return [...new Set(candidates)];
}

async function searchOnce(query, apiKey, perPage, orientation) {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
    query,
  )}&per_page=${perPage}&orientation=${orientation}&content_filter=low`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${apiKey}`,
      "Accept-Version": "v1",
    },
  });
  return res;
}

for (const t of tests) {
  process.stdout.write(`[${t.kind.padEnd(7)}] "${t.query}" ... `);

  const perPage = t.kind === "hero" ? 15 : 10;
  const candidates = buildQueryCandidates(t.query);
  let res, data, count = 0, usedQuery = null;

  for (const candidate of candidates) {
    try {
      res = await searchOnce(candidate, ACCESS_KEY, perPage, t.orientation);
    } catch (err) {
      console.log(`NETWORK ERROR: ${err.message}`);
      res = null;
      break;
    }
    const limit = res.headers.get("x-ratelimit-limit");
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (limit) lastRateLimit = { limit, remaining };

    if (!res.ok) {
      const body = await res.text();
      console.log(
        `HTTP ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
      );
      fail++;
      res = null;
      break;
    }
    data = await res.json();
    count = data.results?.length ?? 0;
    if (count > 0) {
      usedQuery = candidate;
      break;
    }
    // 0 results — try next candidate
  }
  if (!res) continue;
  if (count === 0) {
    console.log(`ZERO RESULTS even after broadening (last try: "${candidates[candidates.length-1]}")`);
    fail++;
    continue;
  }
  if (usedQuery !== t.query) {
    process.stdout.write(`(broadened to "${usedQuery}") `);
  }

  // Same picking logic as resolveHeroImageUrlForQuery — first non-scenery hit.
  const SCENERY_RE = /\b(skyline|cityscape|aerial view of (the )?city|downtown|panorama|landscape|sunset over|sunrise over|view from|tourism)\b/i;
  let picked = data.results[0];
  for (const r of data.results) {
    const text = `${r.description ?? ""} ${r.alt_description ?? ""}`.trim();
    if (text.length === 0 || !SCENERY_RE.test(text)) {
      picked = r;
      break;
    }
  }
  const raw = picked?.urls?.raw ?? picked?.urls?.full;
  if (!raw) {
    console.log(`OK status, ${count} results, but result[0] has NO urls.raw`);
    fail++;
    continue;
  }

  // Verify the photo URL is actually reachable (HEAD request, no params).
  const finalUrl = `${raw}${raw.includes("?") ? "&" : "?"}auto=format&fit=crop&w=1600&h=900&q=80`;
  let head;
  try {
    head = await fetch(finalUrl, { method: "HEAD" });
  } catch (err) {
    console.log(`API OK (${count} results), but URL HEAD failed: ${err.message}`);
    fail++;
    continue;
  }
  if (!head.ok) {
    console.log(`API OK (${count} results), but URL HEAD ${head.status}: ${finalUrl}`);
    fail++;
    continue;
  }

  console.log(`OK (${count} results, URL reachable)`);
  console.log(`           → ${finalUrl}`);
  pass++;
}

console.log(`\n==> Result: ${pass}/${tests.length} passed, ${fail} failed`);
if (lastRateLimit) {
  console.log(
    `==> Rate limit: ${lastRateLimit.remaining}/${lastRateLimit.limit} remaining this hour`,
  );
  if (Number(lastRateLimit.limit) <= 50) {
    console.log(
      `==> WARNING: limit=${lastRateLimit.limit} means this is a DEMO-tier app.`,
    );
    console.log(
      `    Each workspace burns 7 calls; you'll hit 0/${lastRateLimit.limit} after ~7 workspaces/hour.`,
    );
    console.log(
      `    Submit for production approval at https://unsplash.com/oauth/applications`,
    );
    console.log(
      `    to get 5000/hour.`,
    );
  }
}
process.exit(fail > 0 ? 1 : 0);
