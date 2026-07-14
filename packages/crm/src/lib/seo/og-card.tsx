// Shared design module for the per-page Open Graph image endpoint
// (app/api/og/route.tsx). Pure helpers (param sanitizing, short-price
// extraction, URL building) are exported separately from the JSX layouts so
// the helpers can be unit-tested without spinning up ImageResponse/satori.
//
// Design brief: these are OG *thumbnails* — someone scrolling Slack, X, or a
// group chat sees them at ~240px wide for half a second. That means: huge
// type, extreme contrast, 3-second readability, nothing under 28px. Treat
// every card like a YouTube thumbnail, not a print ad.
//
// Palette (MKT, matches components/marketplace/marketplace-data.ts):
//   ink   #221D17   paper  #F6F2EA   green  #1F2B24   dark  #1F2B24
//
// SECURITY: every field rendered by these layouts may originate from a public
// query string (app/api/og/route.tsx is an unauthenticated GET route). Every
// string is clamped through `clamp()` before it reaches JSX, and nothing here
// is ever interpolated into a `style` value, `href`, or `src` — only rendered
// as plain text content. ImageResponse/satori has no script execution
// surface, but clamping still bounds the rendered card's layout.

import type { ReactElement } from "react";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const OG_COLORS = {
  ink: "#221D17",
  paper: "#F6F2EA",
  green: "#1F2B24",
  dark: "#1F2B24",
} as const;

// ─── param sanitizing ───────────────────────────────────────────────────────

/** Strip control/newline characters and hard-cap length. Used on every
 *  attacker-controlled query param before it reaches JSX. */
export function clamp(raw: string | null | undefined, maxLength: number): string {
  const value = (raw ?? "").replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trimEnd();
}

/** Clamp + ellipsize: appends "…" when truncated so the card visibly signals
 *  the value was cut, rather than silently ending mid-word. */
export function clampEllipsis(raw: string | null | undefined, maxLength: number): string {
  const value = (raw ?? "").replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

const PRICE_MAX_LENGTH = 22;

/**
 * Extract a SHORT price string from a competitor's free-form `pricingModel`
 * sentence (e.g. "$97–$497/mo + AI Employee $50–$97/mo per location") down
 * to something that fits a thumbnail pill (≤22 chars): the first $-token plus
 * its immediate unit, e.g. "$97–$497/mo" → "$97-497/mo" is left as-is,
 * "Quote-gated pricing…" → "Quote-only".
 *
 * Pure — used by both the metadata wiring (to build OG URLs) and directly by
 * og-card layouts as a fallback when no explicit `price` param is passed.
 */
export function shortPrice(pricingModel: string): string {
  const text = (pricingModel ?? "").trim();
  if (!text) return "Ask for pricing";

  // Quote-gated / no public price.
  if (/quote[- ]?(only|gated)/i.test(text)) return "Quote-only";

  // First $-token run: "$97–$497/mo", "$29/mo", "$0.05/min", "from ~$16/mo".
  const match = text.match(/\$[\d,.]+(?:\s*[–-]\s*\$?[\d,.]+)?\s*\/\s*(?:mo|min|user\/mo|seat\/mo|caller)/i);
  if (match) {
    const cleaned = match[0].replace(/\s+/g, "").replace(/–/g, "-");
    return clampEllipsis(cleaned, PRICE_MAX_LENGTH);
  }

  // Fallback: just the first $-amount found.
  const bareMatch = text.match(/\$[\d,.]+/);
  if (bareMatch) return clampEllipsis(bareMatch[0], PRICE_MAX_LENGTH);

  return clampEllipsis(text, PRICE_MAX_LENGTH);
}

// ─── OG URL builder ─────────────────────────────────────────────────────────

export type OgCardParams =
  | { kind: "sf-vs"; slug: string; name: string; price: string }
  | { kind: "vs"; a: string; b: string }
  | { kind: "alt"; slug: string; name: string; price: string }
  | { kind: "best"; title: string; aud: string; n: number | string }
  | { kind: "tool"; name: string; hook: string };

/** Build the root-relative /api/og URL for a given card. Pure string
 *  building — callers pass this straight into openGraph.images[].url. */
export function buildOgUrl(params: OgCardParams): string {
  const usp = new URLSearchParams();
  usp.set("kind", params.kind);
  switch (params.kind) {
    case "sf-vs":
      usp.set("slug", params.slug);
      usp.set("name", params.name);
      usp.set("price", params.price);
      break;
    case "vs":
      usp.set("a", params.a);
      usp.set("b", params.b);
      break;
    case "alt":
      usp.set("slug", params.slug);
      usp.set("name", params.name);
      usp.set("price", params.price);
      break;
    case "best":
      usp.set("title", params.title);
      usp.set("aud", params.aud);
      usp.set("n", String(params.n));
      break;
    case "tool":
      usp.set("name", params.name);
      usp.set("hook", params.hook);
      break;
  }
  return `/api/og?${usp.toString()}`;
}

// ─── shared chrome ──────────────────────────────────────────────────────────

/** Small square brand mark (a rounded square + wordmark), top-left on every
 *  card — the one piece of chrome that stays identical across kinds so the
 *  thumbnails read as a series. */
function BrandMark({ onDark }: { onDark: boolean }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          display: "flex",
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: OG_COLORS.green,
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: 26,
          fontWeight: 700,
          fontFamily: "Inter-Bold",
          color: onDark ? OG_COLORS.paper : OG_COLORS.ink,
          letterSpacing: -0.5,
        }}
      >
        {"seldonframe.com"}
      </div>
    </div>
  );
}

/** A pill badge — filled green or outlined muted, used for price tags and
 *  small kickers across every card kind. */
function Pill({
  children,
  filled,
  onDark,
}: {
  children: string;
  filled: boolean;
  onDark: boolean;
}): ReactElement {
  const border = filled ? "none" : `2px solid ${onDark ? "#4A5D52" : "#D8CFBE"}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 28px",
        borderRadius: 999,
        backgroundColor: filled ? OG_COLORS.green : "transparent",
        border,
        fontSize: 30,
        fontWeight: 700,
        fontFamily: "Inter-Bold",
        color: filled ? OG_COLORS.paper : (onDark ? OG_COLORS.paper : OG_COLORS.ink),
      }}
    >
      {children}
    </div>
  );
}

/** Diagonal-stripe texture used on the dark cards — pure CSS gradients, no
 *  stock imagery, subtle enough not to muddy the huge type on top. */
const DIAGONAL_TEXTURE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(246,242,234,0.035) 0px, rgba(246,242,234,0.035) 2px, transparent 2px, transparent 40px)",
} as const;

/** Root card frame every layout renders inside — full bleed, padded, flex
 *  column, the diagonal texture on dark backgrounds only. */
function CardFrame({
  background,
  texture,
  children,
}: {
  background: string;
  texture: boolean;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "56px 64px",
        backgroundColor: background,
        fontFamily: "Inter-Bold",
        ...(texture ? DIAGONAL_TEXTURE : {}),
      }}
    >
      {children}
    </div>
  );
}

/** Thin green accent bar, bottom of every card — the one recurring visual
 *  signature tying the whole thumbnail series together. */
function AccentBar(): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: 10,
        borderRadius: 6,
        backgroundColor: OG_COLORS.green,
      }}
    />
  );
}

// ─── layouts ────────────────────────────────────────────────────────────────

const SF_VS_NAME_MAX = 40;
const VS_NAME_MAX = 32;
const ALT_NAME_MAX = 40;
const BEST_TITLE_MAX = 40;
const BEST_AUD_MAX = 40;
const TOOL_NAME_MAX = 40;
const TOOL_HOOK_MAX = 70;

/** kind=sf-vs — the flagship "SeldonFrame vs {Competitor}" card. */
export function SfVsCard({ name, price }: { name: string; price: string }): ReactElement {
  const safeName = clampEllipsis(name, SF_VS_NAME_MAX) || "Them";
  const safePrice = clampEllipsis(price, 22) || "See pricing";
  return (
    <CardFrame background={OG_COLORS.dark} texture>
      <BrandMark onDark />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.paper, lineHeight: 1.02 }}>
          {"SeldonFrame"}
        </div>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 800, fontFamily: "Inter-ExtraBold", lineHeight: 1.02 }}>
          <span style={{ color: OG_COLORS.paper, marginRight: 24 }}>{"vs"}</span>
          <span style={{ color: OG_COLORS.green }}>{safeName}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", gap: 20 }}>
          <Pill filled onDark>{"$29/mo flat"}</Pill>
          <Pill filled={false} onDark>{safePrice}</Pill>
        </div>
        <AccentBar />
      </div>
    </CardFrame>
  );
}

/** kind=vs — third-party "{A} vs {B}" card. */
export function VsCard({ a, b }: { a: string; b: string }): ReactElement {
  const safeA = clampEllipsis(a, VS_NAME_MAX) || "A";
  const safeB = clampEllipsis(b, VS_NAME_MAX) || "B";
  return (
    <CardFrame background={OG_COLORS.ink} texture={false}>
      <BrandMark onDark />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, fontFamily: "Inter-Bold", color: OG_COLORS.green, textTransform: "uppercase", letterSpacing: 2 }}>
          {"The honest comparison"}
        </div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.paper, lineHeight: 1.05 }}>
          {`${safeA} vs ${safeB}`}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Pill filled onDark>{"Plus: the both-worlds option"}</Pill>
        <AccentBar />
      </div>
    </CardFrame>
  );
}

/** kind=alt — "{Name} alternative" card. */
export function AltCard({ name, price }: { name: string; price: string }): ReactElement {
  const safeName = clampEllipsis(name, ALT_NAME_MAX) || "Your Tool";
  const safePrice = clampEllipsis(price, 22) || "$29/mo flat";
  return (
    <CardFrame background={OG_COLORS.dark} texture>
      <BrandMark onDark />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.paper, lineHeight: 1.02 }}>
          {safeName}
        </div>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.green, lineHeight: 1.02 }}>
          {"alternative"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Pill filled onDark>{`Honest switch guide · ${safePrice}`}</Pill>
        <AccentBar />
      </div>
    </CardFrame>
  );
}

/** kind=best — "{Title}" / "{Audience}" listicle card. */
export function BestCard({ title, aud, n }: { title: string; aud: string; n: string }): ReactElement {
  const safeTitle = clampEllipsis(title, BEST_TITLE_MAX) || "Best Tools";
  const safeAud = clampEllipsis(aud, BEST_AUD_MAX) || "";
  const rank = clampEllipsis(n, 8) || "7";
  return (
    <CardFrame background={OG_COLORS.paper} texture={false}>
      <BrandMark onDark={false} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.ink, lineHeight: 1.03 }}>
          {safeTitle}
        </div>
        {safeAud ? (
          <div style={{ display: "flex", fontSize: 88, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.green, lineHeight: 1.03 }}>
            {safeAud}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Pill filled onDark={false}>{`Top ${rank} · 2026`}</Pill>
        <AccentBar />
      </div>
    </CardFrame>
  );
}

/** kind=tool — free-tool card: "{Name}" + a short hook line. */
export function ToolCard({ name, hook }: { name: string; hook: string }): ReactElement {
  const safeName = clampEllipsis(name, TOOL_NAME_MAX) || "Free Tool";
  const safeHook = clampEllipsis(hook, TOOL_HOOK_MAX) || "";
  return (
    <CardFrame background={OG_COLORS.dark} texture>
      <BrandMark onDark />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.paper, lineHeight: 1.05 }}>
          {safeName}
        </div>
        {safeHook ? (
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, fontFamily: "Inter-Bold", color: OG_COLORS.green, lineHeight: 1.2 }}>
            {safeHook}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Pill filled onDark>{"Free · no signup"}</Pill>
        <AccentBar />
      </div>
    </CardFrame>
  );
}

const AGENT_SHARE_NAME_MAX = 40;
const AGENT_SHARE_STEP_MAX = 28;
const AGENT_SHARE_STEP_CAP = 4;

/** kind=agent-share — the static PNG variant of the celebration screen's
 *  share card (agent setup mode slice, T5). `steps` is the pipe-separated,
 *  ALREADY-SCRUBBED step-label string the public /a/[slug] page's metadata
 *  builds from its own DB read — this route never queries the DB itself,
 *  same convention as every other card here (clamped string params only). */
export function AgentShareCard({ name, steps }: { name: string; steps: string }): ReactElement {
  const safeName = clampEllipsis(name, AGENT_SHARE_NAME_MAX) || "An agent";
  const stepList = steps
    .split("|")
    .map((s) => clampEllipsis(s, AGENT_SHARE_STEP_MAX))
    .filter(Boolean)
    .slice(0, AGENT_SHARE_STEP_CAP);

  return (
    <CardFrame background={OG_COLORS.dark} texture>
      <BrandMark onDark />
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.paper, lineHeight: 1.1 }}>
          {`${safeName} — built with SeldonFrame`}
        </div>
        {stepList.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {stepList.map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 22px",
                    borderRadius: 12,
                    backgroundColor: "#1c2230",
                    border: "2px solid #3a4256",
                    fontSize: 26,
                    fontWeight: 700,
                    fontFamily: "Inter-Bold",
                    color: OG_COLORS.paper,
                  }}
                >
                  {step}
                </div>
                {i < stepList.length - 1 ? (
                  <div style={{ display: "flex", fontSize: 30, color: OG_COLORS.green }}>{"→"}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Pill filled onDark>{"Built from a screen recording"}</Pill>
        <AccentBar />
      </div>
    </CardFrame>
  );
}

/** kind=default (unknown/fallback) — generic brand card, still HTTP 200. */
export function DefaultCard(): ReactElement {
  return (
    <CardFrame background={OG_COLORS.dark} texture>
      <BrandMark onDark />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 800, fontFamily: "Inter-ExtraBold", color: OG_COLORS.paper, lineHeight: 1.02 }}>
          {"SeldonFrame"}
        </div>
        <div style={{ display: "flex", fontSize: 52, fontWeight: 700, fontFamily: "Inter-Bold", color: OG_COLORS.green, lineHeight: 1.2 }}>
          {"The AI front office — $29/mo flat"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <AccentBar />
      </div>
    </CardFrame>
  );
}
