// Server-rendered template for a /blog/<slug> long-form original article —
// rebuilt to match /guides' visual quality exactly (2026-07-13 redesign):
// the `sf-mkt` light parchment theme, the diagrams + callout engine, a real
// video hero (HeroVideoDialog), and a NumberTicker heroStats band. Renders on
// the MKT marketing palette (not MarketingShell's dark chrome) — the guides
// visual engine is imported verbatim, never re-implemented. Stays a server
// component; HeroVideoDialog/NumberTicker/Highlighter are the client leaves.

import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AUTHOR, articleLd, authorPersonLd, AuthorByline } from "@/components/seo/author-byline";
import { getBlogArticle } from "@/lib/seo/blog";
import type { BlogCallout } from "@/lib/seo/blog/types";
import { GuideDiagramView, GuideDiagramStyles, faviconUrl } from "@/components/seo/guide-diagrams";
import { tokenizeInlineMarkup, stripInlineMarkup, startsWithKindOfLike } from "@/lib/seo/guide-inline";
import { HeroVideoDialog } from "@/components/ui/hero-video-dialog";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Highlighter } from "@/components/ui/highlighter";

/** Split a section body into paragraphs on blank lines. */
function paragraphs(body: string): string[] {
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Render markdown-lite text into React nodes (bold/italic/internal links) —
 *  identical contract to guide-page.tsx's renderInlineMarkup, styled for the
 *  MKT light palette. */
function renderInlineMarkup(text: string): ReactNode[] {
  return tokenizeInlineMarkup(text).map((token, i): ReactElement => {
    switch (token.kind) {
      case "bold":
        return <strong key={i}>{token.text}</strong>;
      case "italic":
        return <em key={i}>{token.text}</em>;
      case "link":
        if (token.internal) {
          return (
            <Link key={i} href={token.href} className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              {token.label}
            </Link>
          );
        }
        return <span key={i}>{token.label}</span>;
      case "text":
        return <span key={i}>{token.text}</span>;
    }
  });
}

export { stripInlineMarkup };

const CALLOUT_META: Record<BlogCallout["kind"], { label: string; icon: string; bg: string; border: string }> = {
  analogy: { label: "Kind of like…", icon: "💡", bg: MKT.green10, border: "rgba(31, 43, 36,0.28)" },
  tip: { label: "Tip", icon: "✅", bg: "rgba(34,29,23,0.04)", border: MKT.ink10 },
  warning: { label: "Watch out", icon: "⚠️", bg: "rgba(196,132,30,0.10)", border: "rgba(196,132,30,0.32)" },
};

function CalloutBox({ callout }: { callout: BlogCallout }): ReactElement {
  const meta = CALLOUT_META[callout.kind];
  const skipLabel = callout.kind === "analogy" && startsWithKindOfLike(callout.text);
  return (
    <div
      style={{
        marginTop: 18,
        marginBottom: 6,
        padding: "14px 18px",
        borderRadius: 12,
        border: `1.5px solid ${meta.border}`,
        background: meta.bg,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span aria-hidden style={{ fontSize: 17, lineHeight: 1.5, flex: "0 0 auto" }}>
        {meta.icon}
      </span>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.85)" }}>
        {!skipLabel && (
          <>
            <strong style={{ fontWeight: 800 }}>{meta.label}</strong>
            {callout.kind === "analogy" ? " " : ": "}
          </>
        )}
        {renderInlineMarkup(callout.text)}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}

/** Extract a bare domain (for the favicon service) from a source URL. */
function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Extract the 11-char YouTube video id from a watch/short/embed URL. Returns
 *  null for non-YouTube sources — the caller falls back to no thumbnail/hero. */
function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] ?? null;
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function BlogArticlePage({ slug }: { slug: string }): ReactElement {
  const a = getBlogArticle(slug);
  const canonical = `/blog/${a.slug}`;
  const authorName = a.author ?? AUTHOR.name;

  const articleJsonLd: Record<string, unknown> = {
    ...articleLd({
      headline: stripInlineMarkup(a.title),
      description: stripInlineMarkup(a.description),
      canonicalPath: canonical,
      dateModified: a.date,
    }),
    author: { ...authorPersonLd(), name: authorName },
  };
  // Honest citation only — never a fabricated VideoObject with fields we
  // don't have. `isBasedOn` the raw video URL is all we can back up.
  if (a.sourceVideo) {
    articleJsonLd.isBasedOn = a.sourceVideo.url;
  }
  const faqJsonLd =
    a.faq && a.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: a.faq.map((f) => ({
            "@type": "Question",
            name: stripInlineMarkup(f.q),
            acceptedAnswer: { "@type": "Answer", text: stripInlineMarkup(f.a) },
          })),
        }
      : null;

  const videoId = a.sourceVideo ? youTubeId(a.sourceVideo.url) : null;
  const thumbnail = a.sourceVideo?.thumbnail ?? (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null);
  const embedSrc = videoId ? `https://www.youtube.com/embed/${videoId}` : null;

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <GuideDiagramStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}
      <MarketplaceNav />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/blog" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Blog
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>{a.title}</span>
        </nav>

        <article>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "rgba(34,29,23,0.5)" }}>
            {formatDate(a.date)} · {authorName}
          </p>

          <h1 style={{ margin: 0, fontFamily: MKT.fontSerif, fontSize: "clamp(32px,5vw,52px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, color: MKT.ink }}>
            {a.title}
          </h1>

          <p style={{ margin: "20px 0 0", fontSize: 18, lineHeight: 1.6, color: "rgba(34,29,23,0.72)", fontWeight: 500 }}>
            {renderInlineMarkup(a.dek)}
          </p>

          {a.sourceVideo && embedSrc && thumbnail && (
            <div style={{ marginTop: 30 }}>
              <HeroVideoDialog videoSrc={embedSrc} thumbnailSrc={thumbnail} thumbnailAlt={a.sourceVideo.title} animationStyle="from-center" />
              <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "rgba(34,29,23,0.6)", lineHeight: 1.6 }}>
                Source:{" "}
                <a href={a.sourceVideo.url} target="_blank" rel="noopener noreferrer nofollow" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
                  {a.sourceVideo.title}
                </a>{" "}
                — {a.sourceVideo.channel}
                {a.sourceVideo.timestamp ? ` (${a.sourceVideo.timestamp})` : ""}
              </p>
            </div>
          )}

          {a.heroStats && a.heroStats.length > 0 && (
            <div
              style={{
                marginTop: 28,
                paddingTop: 22,
                borderTop: `1.5px solid ${MKT.green10}`,
                display: "grid",
                gridTemplateColumns: `repeat(${a.heroStats.length}, minmax(0,1fr))`,
                gap: 18,
              }}
            >
              {a.heroStats.map((stat, i) => (
                <div key={i}>
                  <div style={{ fontFamily: MKT.fontMono, fontSize: 26, fontWeight: 700, color: MKT.ink, display: "flex", alignItems: "baseline", gap: 2 }}>
                    <NumberTicker value={stat.value} className="text-[26px] font-bold" style={{ color: MKT.ink, fontFamily: MKT.fontMono }} />
                  </div>
                  <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: MKT.green }}>{stat.display}</div>
                  <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.4, color: "rgba(34,29,23,0.6)" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {a.sections.map((s, si) => (
            <section key={s.h2} style={{ marginTop: 30 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>
                {si === 0 ? <Highlighter>{s.h2}</Highlighter> : s.h2}
              </h2>
              {paragraphs(s.body).map((p, i) => (
                <p key={i} style={{ margin: "0 0 14px", fontSize: 16, lineHeight: 1.7, color: "rgba(34,29,23,0.82)" }}>
                  {renderInlineMarkup(p)}
                </p>
              ))}
              {s.callout && <CalloutBox callout={s.callout} />}
              {s.diagram && <GuideDiagramView d={s.diagram} />}
            </section>
          ))}

          {a.faq && a.faq.length > 0 && (
            <section style={{ marginTop: 40 }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
              {a.faq.map((f) => (
                <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
                  <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{renderInlineMarkup(f.q)}</summary>
                  <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>{renderInlineMarkup(f.a)}</p>
                </details>
              ))}
            </section>
          )}

          {a.sources.length > 0 && (
            <section style={{ marginTop: 34 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Sources</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: "rgba(34,29,23,0.7)" }}>
                {a.sources.map((src) => {
                  const domain = domainFromUrl(src.url);
                  return (
                    <li key={src.url} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                      {domain && <img src={faviconUrl(domain)} width={16} height={16} loading="lazy" alt={`${domain} logo`} style={{ borderRadius: 3, flex: "0 0 auto" }} />}
                      <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="sf-link" style={{ color: MKT.green, fontWeight: 600 }}>
                        {src.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {(a.relatedTool || a.relatedGuide) && (
            <p style={{ margin: "28px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
              {a.relatedTool && (
                <>
                  Related free tool:{" "}
                  <Link href={a.relatedTool} className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
                    open it
                  </Link>
                  .{" "}
                </>
              )}
              {a.relatedGuide && (
                <>
                  Go deeper:{" "}
                  <Link href={a.relatedGuide} className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
                    the full guide
                  </Link>
                  .
                </>
              )}
            </p>
          )}

          <AuthorByline checked={formatDate(a.date)} />

          <footer style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${MKT.ink10}` }}>
            <Link href="/blog" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              ← All posts
            </Link>
          </footer>
        </article>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
