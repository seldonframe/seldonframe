// IndexNow submission — pings Bing/Yandex/Naver the moment URLs are published
// or updated, instead of waiting for a crawl (Bing feeds Copilot + ChatGPT
// search + DuckDuckGo, so this is the GEO fast lane). Protocol:
// https://www.indexnow.org/documentation
//
// The key is PUBLIC by design (ownership is proven by hosting the key file at
// the site root — public/<key>.txt), so committing it here is standard.

const INDEXNOW_KEY = "a2b72d9f355e42a0ba8bb2f0574344cb";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const HOST = "www.seldonframe.com";
/** Protocol cap is 10,000 URLs per request; stay comfortably under it. */
const CHUNK_SIZE = 5000;

export type IndexNowResult = {
  submitted: number;
  chunks: { count: number; status: number }[];
  ok: boolean;
};

/** Submit URLs to IndexNow. Fail-soft: network errors become status 0, never throw. */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  const own = urls.filter((u) => u.startsWith(`https://${HOST}/`));
  const chunks: { count: number; status: number }[] = [];

  for (let i = 0; i < own.length; i += CHUNK_SIZE) {
    const urlList = own.slice(i, i + CHUNK_SIZE);
    let status = 0;
    try {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: HOST,
          key: INDEXNOW_KEY,
          keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
          urlList,
        }),
      });
      status = res.status;
    } catch {
      // fail-soft: leave status 0; the cron retries next week
    }
    chunks.push({ count: urlList.length, status });
  }

  return {
    submitted: own.length,
    chunks,
    // IndexNow returns 200 (ok) or 202 (accepted, key validation pending).
    ok: chunks.length > 0 && chunks.every((c) => c.status === 200 || c.status === 202),
  };
}
