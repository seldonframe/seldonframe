// Agent-Markdown analytics — the server-side AI-traffic classifier + the
// best-effort structured-log adapter (design doc technique #6). These tests lock:
//   • classifyAiRequest tags known AI crawlers (by UA) and AI hosts (by referrer),
//     is case-insensitive, ignores ordinary browsers, and never confuses the two
//     signals;
//   • logMarkdownFetch emits exactly one `action:"md_fetch"` JSON line carrying
//     the classification + path/mode/surface, and is genuinely best-effort
//     (never throws — even on a Request whose header access blows up).

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import {
  classifyAiRequest,
  logMarkdownFetch,
  type MarkdownFetchLogLine,
} from "../../../src/lib/marketplace/md-analytics";

describe("classifyAiRequest() — AI crawler UA detection", () => {
  test("GPTBot UA → aiCrawler GPTBot, isAi true", () => {
    const r = classifyAiRequest({ userAgent: "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)" });
    assert.equal(r.aiCrawler, "GPTBot");
    assert.equal(r.aiReferrer, null);
    assert.equal(r.isAi, true);
  });

  test("ClaudeBot UA → aiCrawler ClaudeBot", () => {
    assert.equal(classifyAiRequest({ userAgent: "ClaudeBot/1.0 (+claudebot@anthropic.com)" }).aiCrawler, "ClaudeBot");
  });

  test("PerplexityBot UA → aiCrawler PerplexityBot", () => {
    assert.equal(classifyAiRequest({ userAgent: "PerplexityBot/1.0" }).aiCrawler, "PerplexityBot");
  });

  test("Bytespider UA → aiCrawler Bytespider", () => {
    assert.equal(classifyAiRequest({ userAgent: "Mozilla/5.0 (compatible; Bytespider; ...)" }).aiCrawler, "Bytespider");
  });

  test("Google-Extended UA → aiCrawler Google-Extended", () => {
    assert.equal(classifyAiRequest({ userAgent: "Google-Extended" }).aiCrawler, "Google-Extended");
  });

  test("CCBot UA → aiCrawler CCBot", () => {
    assert.equal(classifyAiRequest({ userAgent: "CCBot/2.0 (https://commoncrawl.org/faq/)" }).aiCrawler, "CCBot");
  });

  test("case-insensitive match (lowercased UA still detected)", () => {
    assert.equal(classifyAiRequest({ userAgent: "gptbot/1.1" }).aiCrawler, "GPTBot");
    assert.equal(classifyAiRequest({ userAgent: "CLAUDEBOT/1.0" }).aiCrawler, "ClaudeBot");
  });

  test("ChatGPT-User (user-triggered fetch) → aiCrawler ChatGPT-User", () => {
    assert.equal(
      classifyAiRequest({ userAgent: "Mozilla/5.0 ... ChatGPT-User/1.0; +https://openai.com/bot" }).aiCrawler,
      "ChatGPT-User",
    );
  });
});

describe("classifyAiRequest() — not AI (ordinary clients)", () => {
  test("a real Chrome UA → not AI", () => {
    const r = classifyAiRequest({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });
    assert.equal(r.aiCrawler, null);
    assert.equal(r.aiReferrer, null);
    assert.equal(r.isAi, false);
  });

  test("Googlebot (search, not the AI token) → not classified as AI", () => {
    // Plain Googlebot is search crawling — only Google-Extended/GoogleOther are
    // the AI tokens, so this must NOT trip aiCrawler.
    assert.equal(classifyAiRequest({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }).aiCrawler, null);
  });

  test("empty / missing UA and referer → not AI", () => {
    assert.deepEqual(classifyAiRequest({}), { aiCrawler: null, aiReferrer: null, isAi: false });
    assert.deepEqual(classifyAiRequest({ userAgent: "", referer: "" }), {
      aiCrawler: null,
      aiReferrer: null,
      isAi: false,
    });
    assert.deepEqual(classifyAiRequest({ userAgent: null, referer: null }), {
      aiCrawler: null,
      aiReferrer: null,
      isAi: false,
    });
  });
});

describe("classifyAiRequest() — AI referrer (host) detection", () => {
  test("chatgpt.com referrer → aiReferrer chatgpt.com, isAi true", () => {
    const r = classifyAiRequest({ userAgent: "Mozilla/5.0 ...", referer: "https://chatgpt.com/" });
    assert.equal(r.aiReferrer, "chatgpt.com");
    assert.equal(r.aiCrawler, null);
    assert.equal(r.isAi, true);
  });

  test("claude.ai referrer → aiReferrer claude.ai", () => {
    assert.equal(classifyAiRequest({ referer: "https://claude.ai/chat/abc" }).aiReferrer, "claude.ai");
  });

  test("perplexity.ai referrer → aiReferrer perplexity.ai", () => {
    assert.equal(classifyAiRequest({ referer: "https://www.perplexity.ai/search?q=foo" }).aiReferrer, "perplexity.ai");
  });

  test("an ordinary referrer (google.com search) → no aiReferrer", () => {
    assert.equal(classifyAiRequest({ referer: "https://www.google.com/" }).aiReferrer, null);
  });

  test("both signals can fire together (crawler UA + AI referrer)", () => {
    const r = classifyAiRequest({ userAgent: "PerplexityBot/1.0", referer: "https://www.perplexity.ai/" });
    assert.equal(r.aiCrawler, "PerplexityBot");
    assert.equal(r.aiReferrer, "perplexity.ai");
    assert.equal(r.isAi, true);
  });
});

// ─── logMarkdownFetch ────────────────────────────────────────────────────────

/** Build a minimal web-Request-like object the adapter accepts. */
function fakeReq(headers: Record<string, string>, url = "https://app.seldonframe.com/marketplace.md") {
  return { headers: new Headers(headers), url };
}

/** Run `fn` with console.info captured; returns the parsed md_fetch line (or the
 *  raw recorded calls if you need to assert call count). Restores console.info. */
function captureLog(fn: () => void): { lines: MarkdownFetchLogLine[]; calls: number } {
  const original = console.info;
  const recorded: string[] = [];
  console.info = ((...args: unknown[]) => {
    recorded.push(String(args[0]));
  }) as typeof console.info;
  try {
    fn();
  } finally {
    console.info = original;
  }
  return {
    calls: recorded.length,
    lines: recorded.map((s) => JSON.parse(s) as MarkdownFetchLogLine),
  };
}

describe("logMarkdownFetch() — structured md_fetch log line", () => {
  test("emits exactly one action:md_fetch line with the classification", () => {
    const { calls, lines } = captureLog(() =>
      logMarkdownFetch(fakeReq({ "user-agent": "GPTBot/1.1" }), {
        surface: "marketplace_index",
        mode: "explicit_md",
      }),
    );
    assert.equal(calls, 1);
    const line = lines[0];
    assert.equal(line.action, "md_fetch");
    assert.equal(line.surface, "marketplace_index");
    assert.equal(line.mode, "explicit_md");
    assert.equal(line.path, "/marketplace.md");
    assert.equal(line.aiCrawler, "GPTBot");
    assert.equal(line.isAi, true);
    assert.equal(line.userAgent, "GPTBot/1.1");
  });

  test("captures referrer-based AI signal + accept_negotiated mode", () => {
    const { lines } = captureLog(() =>
      logMarkdownFetch(
        fakeReq(
          { "user-agent": "Mozilla/5.0", referer: "https://chatgpt.com/" },
          "https://app.seldonframe.com/marketplace",
        ),
        { surface: "marketplace_listing", mode: "accept_negotiated", path: "/marketplace/ai-receptionist" },
      ),
    );
    const line = lines[0];
    assert.equal(line.mode, "accept_negotiated");
    assert.equal(line.path, "/marketplace/ai-receptionist"); // explicit path override wins
    assert.equal(line.aiReferrer, "chatgpt.com");
    assert.equal(line.isAi, true);
  });

  test("non-AI fetch still logs (isAi:false) — so totals are measurable", () => {
    const { calls, lines } = captureLog(() =>
      logMarkdownFetch(fakeReq({ "user-agent": "curl/8.4.0" }), {
        surface: "llms_txt",
        mode: "explicit_md",
      }),
    );
    assert.equal(calls, 1);
    assert.equal(lines[0].isAi, false);
    assert.equal(lines[0].aiCrawler, null);
  });

  test("BEST-EFFORT: never throws even if header access throws", () => {
    // A Request-like whose headers.get() throws — the adapter must swallow it and
    // emit nothing rather than bubble an error onto the response path.
    const hostile = {
      headers: {
        get() {
          throw new Error("boom");
        },
      } as unknown as Headers,
      url: "https://app.seldonframe.com/robots.txt",
    };
    assert.doesNotThrow(() =>
      logMarkdownFetch(hostile, { surface: "robots_txt", mode: "explicit_md" }),
    );
  });

  test("BEST-EFFORT: a console.info that throws is swallowed too", () => {
    const original = console.info;
    console.info = (() => {
      throw new Error("sink down");
    }) as typeof console.info;
    try {
      assert.doesNotThrow(() =>
        logMarkdownFetch(fakeReq({ "user-agent": "GPTBot/1.1" }), {
          surface: "marketplace_index",
          mode: "explicit_md",
        }),
      );
    } finally {
      console.info = original;
    }
  });

  // Keep node:test's mock registry tidy for any sibling specs in the same proc.
  mock.reset();
});
