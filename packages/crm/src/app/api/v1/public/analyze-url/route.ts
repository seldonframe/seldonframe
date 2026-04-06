import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { previewSessions } from "@/db/schema";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { checkRateLimit } from "@/lib/utils/rate-limit";

type DetectedTool = { name: string; slug: string; icon: string; autoConnect: boolean };

type ExtractedBusinessData = {
  businessName: string | null;
  industry: string | null;
  tagline: string | null;
  description: string | null;
  services: Array<{ name: string; description: string; price: string | null; duration: string | null }>;
  testimonials: Array<{ quote: string; author: string; role: string | null }>;
  contactInfo: { email: string | null; phone: string | null; address: string | null };
  voiceTone: string | null;
  idealClient: string | null;
  suggestedFramework: "coaching" | "agency" | "saas" | "ecommerce" | "services" | "other";
};

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_MARKDOWN_CHARS = 50_000;
const MAX_MODEL_INPUT_CHARS = 15_000;

function getCorsOrigin() {
  const configured = process.env.MARKETING_SITE_ORIGIN?.trim();
  return configured || "*";
}

function withCors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", getCorsOrigin());
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return "local";
  }

  return forwarded.split(",")[0]?.trim() || "local";
}

function normalizeInputUrl(value: string) {
  const raw = value.trim();
  if (!raw) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function htmlToMarkdown(html: string): string {
  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

  clean = clean
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return clean;
}

function extractPrimaryColor(html: string): string {
  const themeColorMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i);
  if (themeColorMatch?.[1]) {
    return themeColorMatch[1];
  }

  const cssVarMatch = html.match(/--(?:primary|brand|main|accent)(?:-color)?:\s*(#[0-9a-fA-F]{3,8})/);
  if (cssVarMatch?.[1]) {
    return cssVarMatch[1];
  }

  const hexMatches = html.match(/#[0-9a-fA-F]{6}/g) || [];
  const colorful = hexMatches.filter((c) => {
    const r = Number.parseInt(c.slice(1, 3), 16);
    const g = Number.parseInt(c.slice(3, 5), 16);
    const b = Number.parseInt(c.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max - min > 40;
  });

  return colorful[0] || "#14b8a6";
}

function detectTools(html: string): DetectedTool[] {
  const source = html.toLowerCase();
  const tools: DetectedTool[] = [];

  const add = (tool: DetectedTool) => {
    if (!tools.some((item) => item.slug === tool.slug)) {
      tools.push(tool);
    }
  };

  if (source.includes("kit.com") || source.includes("convertkit.com") || source.includes("data-sv-form")) {
    add({ name: "Kit (ConvertKit)", slug: "kit", icon: "mail", autoConnect: true });
  }
  if (source.includes("mailchimp.com") || source.includes("mc-embedded") || source.includes("list-manage.com")) {
    add({ name: "Mailchimp", slug: "mailchimp", icon: "mail", autoConnect: true });
  }
  if (source.includes("beehiiv.com")) {
    add({ name: "Beehiiv", slug: "beehiiv", icon: "mail", autoConnect: true });
  }
  if (source.includes("substack.com")) {
    add({ name: "Substack", slug: "substack", icon: "mail", autoConnect: false });
  }

  if (source.includes("calendly.com")) {
    add({ name: "Calendly", slug: "calendly", icon: "calendar", autoConnect: false });
  }
  if (source.includes("cal.com") || source.includes("app.cal.com")) {
    add({ name: "Cal.com", slug: "calcom", icon: "calendar", autoConnect: false });
  }
  if (source.includes("acuityscheduling.com")) {
    add({ name: "Acuity", slug: "acuity", icon: "calendar", autoConnect: false });
  }

  if (source.includes("js.stripe.com") || source.includes("stripe.com")) {
    add({ name: "Stripe", slug: "stripe", icon: "credit-card", autoConnect: true });
  }
  if (source.includes("paypal.com")) {
    add({ name: "PayPal", slug: "paypal", icon: "credit-card", autoConnect: false });
  }

  if (source.includes("gtag") || source.includes("google-analytics.com") || source.includes("googletagmanager.com")) {
    add({ name: "Google Analytics", slug: "ga", icon: "bar-chart", autoConnect: false });
  }
  if (source.includes("facebook.com/tr") || source.includes("fbq(")) {
    add({ name: "Meta Pixel", slug: "meta-pixel", icon: "eye", autoConnect: false });
  }

  if (source.includes("squarespace.com") || source.includes("static1.squarespace.com")) {
    add({ name: "Squarespace", slug: "squarespace", icon: "layout", autoConnect: false });
  }
  if (source.includes("wix.com") || source.includes("parastorage.com")) {
    add({ name: "Wix", slug: "wix", icon: "layout", autoConnect: false });
  }
  if (source.includes("wordpress.org") || source.includes("wp-content")) {
    add({ name: "WordPress", slug: "wordpress", icon: "layout", autoConnect: false });
  }
  if (source.includes("webflow.com") || source.includes("assets.website-files.com")) {
    add({ name: "Webflow", slug: "webflow", icon: "layout", autoConnect: false });
  }
  if (source.includes("carrd.co")) {
    add({ name: "Carrd", slug: "carrd", icon: "layout", autoConnect: false });
  }
  if (source.includes("stan.store")) {
    add({ name: "Stan Store", slug: "stan", icon: "layout", autoConnect: false });
  }
  if (source.includes("linktr.ee") || source.includes("linktree")) {
    add({ name: "Linktree", slug: "linktree", icon: "layout", autoConnect: false });
  }

  if (source.includes("google.com/maps") || source.includes("goo.gl/maps") || source.includes("maps.googleapis.com")) {
    add({ name: "Google Maps", slug: "gmaps", icon: "map-pin", autoConnect: false });
  }

  return tools;
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new Anthropic({ apiKey });
}

function fallbackBusinessData(markdown: string): ExtractedBusinessData {
  const titleLine = markdown.split("\n").find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() || null;
  const email = markdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/)?.[0] || null;
  const phone = markdown.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0] || null;

  return {
    businessName: titleLine,
    industry: null,
    tagline: null,
    description: markdown.slice(0, 240) || null,
    services: [],
    testimonials: [],
    contactInfo: { email, phone, address: null },
    voiceTone: null,
    idealClient: null,
    suggestedFramework: "other",
  };
}

function normalizeBusinessData(value: unknown, markdown: string): ExtractedBusinessData {
  if (!value || typeof value !== "object") {
    return fallbackBusinessData(markdown);
  }

  const data = value as Record<string, unknown>;
  const fallback = fallbackBusinessData(markdown);

  const frameworkRaw = String(data.suggestedFramework ?? fallback.suggestedFramework).trim().toLowerCase();
  const suggestedFramework: ExtractedBusinessData["suggestedFramework"] =
    frameworkRaw === "coaching" || frameworkRaw === "agency" || frameworkRaw === "saas" || frameworkRaw === "ecommerce" || frameworkRaw === "services"
      ? frameworkRaw
      : "other";

  const services = Array.isArray(data.services)
    ? data.services
        .map((item) => {
          const row = item as Record<string, unknown>;
          const name = String(row.name ?? "").trim();
          if (!name) {
            return null;
          }

          return {
            name,
            description: String(row.description ?? "").trim(),
            price: row.price ? String(row.price).trim() : null,
            duration: row.duration ? String(row.duration).trim() : null,
          };
        })
        .filter(Boolean) as ExtractedBusinessData["services"]
    : [];

  const testimonials = Array.isArray(data.testimonials)
    ? data.testimonials
        .map((item) => {
          const row = item as Record<string, unknown>;
          const quote = String(row.quote ?? "").trim();
          if (!quote) {
            return null;
          }

          return {
            quote,
            author: String(row.author ?? "").trim() || "Unknown",
            role: row.role ? String(row.role).trim() : null,
          };
        })
        .filter(Boolean) as ExtractedBusinessData["testimonials"]
    : [];

  const contactInfoRaw = (data.contactInfo as Record<string, unknown> | undefined) ?? {};

  return {
    businessName: String(data.businessName ?? "").trim() || fallback.businessName,
    industry: String(data.industry ?? "").trim() || fallback.industry,
    tagline: String(data.tagline ?? "").trim() || fallback.tagline,
    description: String(data.description ?? "").trim() || fallback.description,
    services,
    testimonials,
    contactInfo: {
      email: String(contactInfoRaw.email ?? "").trim() || fallback.contactInfo.email,
      phone: String(contactInfoRaw.phone ?? "").trim() || fallback.contactInfo.phone,
      address: String(contactInfoRaw.address ?? "").trim() || fallback.contactInfo.address,
    },
    voiceTone: String(data.voiceTone ?? "").trim() || fallback.voiceTone,
    idealClient: String(data.idealClient ?? "").trim() || fallback.idealClient,
    suggestedFramework,
  };
}

async function extractBusinessData(markdown: string, url: string): Promise<ExtractedBusinessData> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return fallbackBusinessData(markdown);
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system:
        "You extract structured business data from website content. Return ONLY valid JSON, no markdown fences. If a field cannot be determined, use null. Extract the business's own words when possible.",
      messages: [
        {
          role: "user",
          content: `Extract business data from this website (${url}):\n\n${markdown.slice(0, MAX_MODEL_INPUT_CHARS)}\n\nReturn JSON:\n{\n  \"businessName\": \"string\",\n  \"industry\": \"string\",\n  \"tagline\": \"string\",\n  \"description\": \"string\",\n  \"services\": [{ \"name\": \"string\", \"description\": \"string\", \"price\": \"string or null\", \"duration\": \"string or null\" }],\n  \"testimonials\": [{ \"quote\": \"string\", \"author\": \"string\", \"role\": \"string or null\" }],\n  \"contactInfo\": { \"email\": \"string or null\", \"phone\": \"string or null\", \"address\": \"string or null\" },\n  \"voiceTone\": \"string\",\n  \"idealClient\": \"string or null\",\n  \"suggestedFramework\": \"coaching | agency | saas | ecommerce | services | other\"\n}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    if (!text) {
      return fallbackBusinessData(markdown);
    }

    const normalized = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return normalizeBusinessData(JSON.parse(normalized), markdown);
  } catch {
    return fallbackBusinessData(markdown);
  }
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  if (isDemoReadonly()) {
    return withCors(demoApiBlockedResponse());
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`public-url-analyze:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return withCors(NextResponse.json({ error: "Rate limit exceeded. Try again in about an hour." }, { status: 429 }));
  }

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const urlValue = typeof body.url === "string" ? body.url : "";
  const cleanUrl = normalizeInputUrl(urlValue);

  if (!cleanUrl) {
    return withCors(NextResponse.json({ error: "URL is required" }, { status: 400 }));
  }

  try {
    const response = await fetch(cleanUrl, {
      headers: { "User-Agent": "SeldonFrame/1.0 (Business Analysis)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return withCors(
        NextResponse.json({ error: `Could not read that URL (status ${response.status}).` }, { status: 422 })
      );
    }

    const html = await response.text();
    const markdown = htmlToMarkdown(html).slice(0, MAX_MARKDOWN_CHARS);
    const detectedTools = detectTools(html);
    const themeColor = extractPrimaryColor(html);
    const businessData = await extractBusinessData(markdown, cleanUrl);

    const claimToken = randomUUID();

    await db.insert(previewSessions).values({
      token: claimToken,
      url: cleanUrl,
      businessData,
      detectedTools,
      themeColor,
      rawMarkdown: markdown,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return withCors(
      NextResponse.json({
        claimToken,
        business: businessData,
        tools: detectedTools,
        themeColor,
      })
    );
  } catch {
    return withCors(
      NextResponse.json(
        { error: "Could not read that URL. Make sure it's a public website." },
        { status: 422 }
      )
    );
  }
}
