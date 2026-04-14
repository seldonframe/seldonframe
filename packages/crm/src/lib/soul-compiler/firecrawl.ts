import { createHash } from "crypto";
import fs from "fs/promises";
import path from "node:path";

const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_BASE_URL?.trim() || "http://localhost:3002";
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY?.trim() || "";
const CACHE_DIR = process.env.SOUL_COMPILER_CACHE_DIR || ".cache/soul-compiler";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const soulCompilerFallbackErrorMessage =
  "I couldn’t read your website automatically. Try sending me a clear description of your business instead and I’ll create the workspace from that.";

/**
 * Firecrawl integration for soul compiler
 * Follows the locked Firecrawl Scrape Strategy v1 exactly.
 */

const DEFAULT_SCRAPE_OPTIONS = {
  formats: ["markdown"] as const,
  onlyMainContent: true,
  waitFor: 2000,
  timeout: 30000,
  removeTags: ["script", "style", "nav", "footer", "header", "aside"],
};

const PRIORITY_SLUGS: Array<{ label: string; regex: RegExp }> = [
  { label: "ABOUT", regex: /\/(about(?:-us)?|our-story)\/?$/i },
  { label: "SERVICES", regex: /\/(services|what-we-do|offerings)\/?$/i },
  { label: "PRICING", regex: /\/(pricing|plans|packages)\/?$/i },
  { label: "WORK", regex: /\/(work|portfolio|case-studies|projects)\/?$/i },
  { label: "TEAM", regex: /\/(team|about-the-team|our-team)\/?$/i },
];

type FirecrawlMapLink = { url?: string } | string;

type FirecrawlMapResponse = {
  links?: FirecrawlMapLink[];
};

type FirecrawlScrapeResponse = {
  success?: boolean;
  data?: {
    markdown?: string;
  };
};

export type PriorityPage = {
  url: string;
  label: string;
};

export interface ScrapedPage {
  url: string;
  markdown: string;
  type: string;
}

export interface CompiledWebsiteMarkdown {
  markdown: string;
  pagesUsed: string[];
}

function normalizeBaseUrl(input: string) {
  const value = input.trim();
  if (!value) {
    return "";
  }

  const prefixed = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(prefixed);
    return `${parsed.origin}/`;
  } catch {
    return "";
  }
}

function isAllowedPath(urlValue: string) {
  const pathname = new URL(urlValue).pathname.toLowerCase();
  const depth = pathname.split("/").filter(Boolean).length;

  if (depth > 2) {
    return false;
  }

  if (/\/(blog|news|archive|category|tag|post)\b/.test(pathname)) {
    return false;
  }

  if (/\/(contact|book|get-in-touch)\b/.test(pathname)) {
    return false;
  }

  return true;
}

function getCacheKey(baseUrl: string) {
  const keyInput = baseUrl + JSON.stringify(DEFAULT_SCRAPE_OPTIONS);
  return createHash("sha256").update(keyInput).digest("hex");
}

function toSectionHeader(label: string) {
  return `—${label.toUpperCase()}—`;
}

function sectionize(markdownByPage: PriorityPage[], markdownMap: Map<string, string>) {
  const sections: string[] = [];

  for (const page of markdownByPage) {
    const content = (markdownMap.get(page.url) || "").trim();
    if (!content) {
      continue;
    }

    sections.push(`${toSectionHeader(page.label)}\n${content}`);
  }

  return sections.join("\n\n").trim();
}

function extractMapUrls(response: FirecrawlMapResponse) {
  const links = Array.isArray(response.links) ? response.links : [];
  const urls = links
    .map((link) => {
      if (typeof link === "string") {
        return link;
      }

      return typeof link?.url === "string" ? link.url : "";
    })
    .filter((url): url is string => Boolean(url));

  return Array.from(new Set(urls));
}

function pickLabel(urlValue: string) {
  const pathname = new URL(urlValue).pathname;

  for (const slug of PRIORITY_SLUGS) {
    if (slug.regex.test(pathname)) {
      return slug.label;
    }
  }

  return "PAGE";
}

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    return;
  }
}

async function getCached(cacheKey: string) {
  const filePath = path.join(CACHE_DIR, `${cacheKey}.md`);

  try {
    const stat = await fs.stat(filePath);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) {
      await fs.unlink(filePath);
      return null;
    }
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function setCached(cacheKey: string, content: string) {
  const filePath = path.join(CACHE_DIR, `${cacheKey}.md`);
  await ensureCacheDir();
  await fs.writeFile(filePath, content, "utf8");
}

async function firecrawlRequest<T>(endpoint: "/v1/map" | "/v1/scrape", payload: Record<string, unknown>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (FIRECRAWL_API_KEY) {
    headers.Authorization = `Bearer ${FIRECRAWL_API_KEY}`;
  }

  const response = await fetch(`${FIRECRAWL_BASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl ${endpoint} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function dynamicImport(moduleName: string) {
  try {
    const importer = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
    return await importer(moduleName);
  } catch {
    return null;
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<main[^>]*>/gi, "")
    .replace(/<\/main>/gi, "")
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fallbackReadability(baseUrl: string) {
  const response = await fetch(baseUrl, {
    headers: { "User-Agent": "SeldonFrame/1.0 (Soul Compiler)" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Fallback fetch failed with ${response.status}`);
  }

  const html = await response.text();

  const readabilityMod = await dynamicImport("@mozilla/readability");
  const jsdomMod = await dynamicImport("jsdom");

  if (readabilityMod && jsdomMod && typeof (jsdomMod as { JSDOM?: unknown }).JSDOM === "function") {
    const JSDOM = (jsdomMod as { JSDOM: new (html: string, options?: Record<string, unknown>) => { window: unknown } }).JSDOM;
    const Readability = (readabilityMod as { Readability?: new (doc: unknown) => { parse: () => { textContent?: string } | null } }).Readability;

    if (Readability) {
      const dom = new JSDOM(html, { url: baseUrl });
      const article = new Readability((dom as { window: { document: unknown } }).window.document).parse();
      const text = article?.textContent?.trim() || "";
      if (text.length > 0) {
        return text;
      }
    }
  }

  return htmlToText(html);
}

async function discoverPriorityPageDetails(baseUrl: string): Promise<PriorityPage[]> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return [];
  }

  const mapResponse = await firecrawlRequest<FirecrawlMapResponse>("/v1/map", {
    url: normalizedBaseUrl,
    includeSubdomains: false,
  });

  const discovered = extractMapUrls(mapResponse)
    .filter((candidate) => {
      try {
        const parsed = new URL(candidate);
        return parsed.origin === new URL(normalizedBaseUrl).origin;
      } catch {
        return false;
      }
    })
    .filter((candidate) => {
      try {
        return isAllowedPath(candidate);
      } catch {
        return false;
      }
    });

  const secondaryPages: string[] = [];

  for (const slugRegex of PRIORITY_SLUGS.map((entry) => entry.regex)) {
    const match = discovered.find((candidate) => slugRegex.test(new URL(candidate).pathname));
    if (match && !secondaryPages.includes(match)) {
      secondaryPages.push(match);
      if (secondaryPages.length >= 2) {
        break;
      }
    }
  }

  const allPages = [normalizedBaseUrl, ...secondaryPages.slice(0, 2)];

  return allPages.map((url, index) => ({
    url,
    label: index === 0 ? "HOMEPAGE" : pickLabel(url),
  }));
}

export async function discoverPriorityPages(baseUrl: string): Promise<string[]> {
  const details = await discoverPriorityPageDetails(baseUrl);
  return details.map((page) => page.url);
}

async function scrapePage(url: string) {
  const response = await firecrawlRequest<FirecrawlScrapeResponse>("/v1/scrape", {
    url,
    ...DEFAULT_SCRAPE_OPTIONS,
  });

  const markdown = response?.data?.markdown?.trim() || "";
  if (!markdown) {
    throw new Error(`No markdown returned for ${url}`);
  }

  return markdown;
}

export async function scrapePriorityPages(baseUrl: string) {
  const pages = await discoverPriorityPageDetails(baseUrl);

  if (pages.length === 0) {
    return {
      pages,
      markdown: "",
      ok: false as const,
    };
  }

  const markdownMap = new Map<string, string>();

  for (const page of pages) {
    const markdown = await scrapePage(page.url);
    markdownMap.set(page.url, markdown);
  }

  const markdown = sectionize(pages, markdownMap);
  return {
    pages,
    markdown,
    ok: markdown.length > 0,
  };
}

export async function scrapePages(pages: string[]): Promise<ScrapedPage[]> {
  const output: ScrapedPage[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const pageUrl = pages[index];
    const markdown = await scrapePage(pageUrl);
    output.push({
      url: pageUrl,
      markdown,
      type: index === 0 ? "homepage" : pickLabel(pageUrl).toLowerCase(),
    });
  }

  return output;
}

export async function compileWebsiteToMarkdown(baseUrl: string): Promise<CompiledWebsiteMarkdown> {
  await ensureCacheDir();
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const cacheKey = getCacheKey(normalizedBaseUrl || baseUrl);

  if (!normalizedBaseUrl) {
    return {
      markdown: soulCompilerFallbackErrorMessage,
      pagesUsed: [],
    };
  }

  const cached = await getCached(cacheKey);
  if (cached) {
    return {
      markdown: cached,
      pagesUsed: ["cached"],
    };
  }

  try {
    const scraped = await scrapePriorityPages(normalizedBaseUrl);

    if (!scraped.ok || scraped.pages.length === 0 || !scraped.markdown) {
      throw new Error("Firecrawl returned no pages");
    }

    await setCached(cacheKey, scraped.markdown);

    return {
      markdown: scraped.markdown,
      pagesUsed: scraped.pages.map((page) => page.url),
    };
  } catch {
    try {
      const fallbackText = (await fallbackReadability(normalizedBaseUrl)).trim();
      if (fallbackText.length < 200) {
        return {
          markdown: soulCompilerFallbackErrorMessage,
          pagesUsed: [],
        };
      }

      const fallbackMarkdown = `${toSectionHeader("HOMEPAGE")}\n${fallbackText}`;
      await setCached(cacheKey, fallbackMarkdown);

      return {
        markdown: fallbackMarkdown,
        pagesUsed: [normalizedBaseUrl],
      };
    } catch {
      return {
        markdown: soulCompilerFallbackErrorMessage,
        pagesUsed: [],
      };
    }
  }
}
