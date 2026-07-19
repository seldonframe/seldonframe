// The "/best/<category>-for-<audience>" listicle template — the third SEO/GEO
// page family, alongside alternative-page.tsx (X alternative) and vs-page.tsx
// (X vs Y). SeldonFrame renders #1 (honest self-interest, admitted up front),
// followed by ranked contender cards with genuine strengths + a real watchOut,
// a comparison table, an optional "what about free" section, FAQ and
// cross-links. Fully server-rendered from lib/seo/best-pages.ts; Markdown twin
// at /best/<slug>.md (static dotted route folder — no proxy changes).

import type { CSSProperties, ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { MarkdownPointer } from "@/components/seo/markdown-pointer";
import { TldrBox } from "@/components/seo/tldr-box";
import { LiteYoutube } from "@/components/seo/lite-youtube";
import { BuildWidget } from "@/components/seo/build-widget";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { emphasize } from "@/lib/seo/emphasize";
import {
  BEST_PAGES,
  LAST_UPDATED,
  bestSlug,
  getBestPage,
  midSentence,
  type BestCategory,
  type BestAudience,
  type BestContender,
} from "@/lib/seo/best-pages";
import { START_HREF, DEMO_HREF } from "@/lib/seo/alternative-pages-extras";
import { getCompetitor, sfPriceAnchor } from "@/lib/seo/alternative-pages";

/** Best-pages are category-based, not tied to one competitor's audience band
 *  (contenders here aren't joined to the alternative-pages registry by slug).
 *  Absent a per-category audience signal, anchor these listicles as "mixed"
 *  — never assume the narrower solo-only framing (Max, 2026-07-16). */
const BEST_PAGE_AUDIENCE = "mixed" as const;

/** Maps a /best category slug to a related /alternative-to-<slug> page, when
 *  one exists in the competitor registry (honest, no dangling link). */
const CATEGORY_ALTERNATIVE_LINK: Partial<Record<string, string>> = {
  crm: "gohighlevel",
  "ai-receptionist": "goodcall",
  "website-builder": "durable",
  "everyday-ai-agent": "lindy",
};

/** Compose the "cheapest real option" TL;DR fact: prefer a contender whose
 *  `from` string mentions "free" (labeled honestly as "has a free plan"),
 *  else fall back to the first contender's `from` line (the registry lists
 *  contenders in a stable, already-considered order — never-lies: this reads
 *  the string, it never invents a price). Pure + exported for unit tests. */
export function composeCheapestOption(category: BestCategory): string {
  // "no free tier" must not count as having a free plan (never-lies).
  const freeContender = category.contenders.find((c) => /free/i.test(c.from) && !/no free/i.test(c.from));
  if (freeContender) {
    return `${freeContender.name} — ${freeContender.from} (has a free plan)`;
  }
  const cheapest = category.contenders[0];
  return `${cheapest.name} — ${cheapest.from}`;
}

// Single source of truth lives in lib/seo/month-iso.ts (shared with the
// comparison/pricing templates); imported for local use and re-exported for
// the spec's existing import path.
import { monthYearToIso } from "@/lib/seo/month-iso";
export { monthYearToIso };

/** The quotable "quick-answer picks" list — deliberately no pitch language,
 *  just name + honest one-line reason, safe for an AI answer engine to lift
 *  verbatim. Pure + exported for the Markdown twin to reuse. */
export function composeQuickPicks(category: BestCategory, audience: BestAudience): string[] {
  const lines = [`SeldonFrame — best overall for ${midSentence(audience.label)}`];
  for (const c of category.contenders) {
    const shortBestFor = c.bestFor.charAt(0).toLowerCase() + c.bestFor.slice(1);
    lines.push(`${c.name} — best for ${shortBestFor}`);
  }
  return lines;
}

type DecisionLine = { name: string; chooseIf: string; skipIf: string };

/** The "choose X if… / skip it if…" decision framework — composed entirely
 *  from existing registry fields (bestFor/strengths/watchOut), no new prose
 *  fields needed. Pure + exported for the Markdown twin to reuse. */
export function composeDecisionFramework(category: BestCategory, audience: BestAudience): DecisionLine[] {
  const lines: DecisionLine[] = [
    {
      name: "SeldonFrame",
      chooseIf: `you want the whole front office — website, CRM, booking and an AI receptionist — for ${midSentence(audience.label)}`,
      skipIf: "you specifically need a dedicated funnel-builder, or you want a platform with a longer track record",
    },
  ];
  for (const c of category.contenders) {
    const shortBestFor = c.bestFor.charAt(0).toLowerCase() + c.bestFor.slice(1);
    lines.push({
      name: c.name,
      chooseIf: shortBestFor,
      skipIf: c.watchOut,
    });
  }
  return lines;
}

export function BestPage({ slug }: { slug: string }): ReactElement {
  const { page, category, audience } = getBestPage(slug);
  const total = category.contenders.length + 1;
  const h1 = `The ${total} Best ${category.nounPlural} for ${audience.label} (2026)`;

  const videoLd =
    page.videoId && page.videoUploadDate
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: h1,
          thumbnailUrl: `https://i.ytimg.com/vi/${page.videoId}/hqdefault.jpg`,
          uploadDate: page.videoUploadDate,
          embedUrl: `https://www.youtube-nocookie.com/embed/${page.videoId}`,
        }
      : null;

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "SeldonFrame",
        url: `https://seldonframe.com/best/${slug}`,
      },
      ...category.contenders.map((c, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: c.name,
      })),
    ],
  };

  const faqEntries = [
    ...category.faq,
    {
      q: `What's the best ${midSentence(category.noun)} for ${midSentence(audience.label)}?`,
      a: `Honestly, it depends on what's already missing. If leads are falling through the cracks between "someone reached out" and "someone followed up," SeldonFrame's combined AI receptionist + CRM + booking is built for exactly that gap. If the need is narrower — just a calendar link, just a CRM, just a form — one of the specialist tools above may be simpler for now.`,
    },
  ];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const relatedByAudience = BEST_PAGES.filter((p) => p.audience === audience.slug && p.category !== category.slug).slice(0, 2);
  const relatedByCategory = BEST_PAGES.filter((p) => p.category === category.slug && p.audience !== audience.slug).slice(0, 2);
  const relatedPages = [...relatedByCategory, ...relatedByAudience];
  const alternativeSlug = CATEGORY_ALTERNATIVE_LINK[category.slug];
  const alternative = alternativeSlug ? getCompetitor(alternativeSlug) : null;

  const quickPicks = composeQuickPicks(category, audience);
  const decisionFramework = composeDecisionFramework(category, audience);
  const articleLdData = articleLd({
    headline: h1,
    description: `${category.contenders.length + 1} ${category.nounPlural} for ${audience.label}, ranked honestly — pricing verified from each vendor's public pricing page.`,
    canonicalPath: `/best/${slug}`,
    dateModified: monthYearToIso(LAST_UPDATED),
  });

  return (
    <div
      className="sf-mkt sf-bestpage"
      style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}
    >
      <MarketplaceStyles />
      <BestPageStyles />
      <MarkdownPointer href={`/best/${slug}.md`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLdData) }} />
      {videoLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoLd) }} />}
      <MarketplaceNav />

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "26px 32px 70px", width: "100%" }}>
        {/* breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 22 }}
        >
          <Link href="/best" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Best of
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>{`${category.nounPlural} for ${audience.label}`}</span>
        </nav>

        {/* ── HERO ── */}
        <header style={{ paddingBottom: 30, borderBottom: `1px solid ${MKT.ink10}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
            {`Best ${category.nounPlural} · updated ${LAST_UPDATED}`}
          </div>
          <AuthorByline checked={LAST_UPDATED} />
          <h1 className="sf-best-h1" style={{ margin: "14px 0 0", fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, maxWidth: 780 }}>
            {h1}
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 17.5, lineHeight: 1.6, color: "rgba(34,29,23,0.75)", maxWidth: 720 }}>
            {`${audience.painHook.charAt(0).toUpperCase()}${audience.painHook.slice(1)} — most ${midSentence(audience.label)} searching for the best ${midSentence(category.nounPlural)} are really trying to solve one thing: ${category.intentLine}.`}
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.6)", maxWidth: 720 }}>
            {`We build one of these, so we put ourselves first below — but every other pick here gets a genuine strength list and a real, honest catch. We're not going to pretend the others don't work.`}
          </p>
          {page.videoId && <LiteYoutube videoId={page.videoId} title={h1} />}
          <TldrBox
            items={[
              { icon: "🏆", label: "Our pick", text: `SeldonFrame — the whole front office, ${sfPriceAnchor(BEST_PAGE_AUDIENCE)} (we build it, and we say below when the others win)` },
              { icon: "💰", label: "Cheapest real option", text: composeCheapestOption(category) },
              { icon: "🔍", label: "How to choose", text: category.intentLine },
            ]}
          />
        </header>

        {/* ── QUICK-ANSWER PICKS (deliberately quotable — no pitch language) ── */}
        <section style={{ padding: "26px 0 8px" }}>
          <h2 style={{ ...H2, fontSize: 20 }}>Our picks at a glance:</h2>
          <ol style={{ margin: "14px 0 0", padding: "0 0 0 22px", fontSize: 15.5, lineHeight: 1.75, color: "rgba(34,29,23,0.8)" }}>
            {quickPicks.map((line) => (
              <li key={line}>{emphasize(line)}</li>
            ))}
          </ol>
        </section>

        {/* ── METHODOLOGY ── */}
        <section
          style={{
            margin: "22px 0 0",
            border: `1px solid ${MKT.ink10}`,
            borderRadius: 14,
            padding: "18px 22px",
            background: "rgba(255,255,255,0.4)",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>How we ranked these</h3>
          <ul style={{ margin: "10px 0 0", padding: "0 0 0 18px", fontSize: 13.5, lineHeight: 1.6, color: "rgba(34,29,23,0.68)" }}>
            <li>{`Pricing verified from each vendor's own public pricing page as of ${LAST_UPDATED}.`}</li>
            <li>{`We build SeldonFrame and rank it #1 for the front-office job — the honest catch on every other pick is listed too, so you can disagree.`}</li>
            <li>{`Rankings weigh fit for ${midSentence(audience.label)} over raw feature count.`}</li>
            <li>No vendor paid for placement on this page.</li>
          </ul>
        </section>

        {/* ── #1 SELDONFRAME CARD ── */}
        <section style={{ padding: "30px 0 8px" }}>
          <div
            style={{
              border: `2px solid ${MKT.green}`,
              borderRadius: 20,
              padding: "26px 28px",
              background: MKT.green10,
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -13,
                left: 24,
                background: MKT.green,
                color: "#fff",
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderRadius: 999,
                padding: "4px 12px",
              }}
            >
              #1 · Best overall
            </span>
            <h2 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>SeldonFrame</h2>
            <p style={{ margin: "10px 0 0", fontSize: 15.5, lineHeight: 1.65, color: "rgba(34,29,23,0.8)", maxWidth: 720 }}>{category.sfPitch}</p>
            <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.6, color: "rgba(34,29,23,0.72)", maxWidth: 720 }}>
              {`For ${midSentence(audience.label)}, that means ${audience.exampleService} gets captured and booked automatically — whether the customer calls, texts or fills out a form.`}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                marginTop: 18,
                fontSize: 14,
                fontWeight: 700,
                color: MKT.green,
              }}
            >
              <span>$29/mo flat solo · $99+/mo agency</span>
              <span style={{ color: "rgba(34,29,23,0.3)" }}>·</span>
              <span>First workspace free forever</span>
              <span style={{ color: "rgba(34,29,23,0.3)" }}>·</span>
              <span>Build it free in ~3 minutes before signup</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
              <a href={START_HREF} style={{ background: MKT.green, color: "#fff", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
                Start for free
              </a>
              <a href={DEMO_HREF} style={{ border: `1.5px solid ${MKT.green}`, color: MKT.green, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
                Book a demo call
              </a>
            </div>
          </div>
        </section>

        {/* ── RANKED CONTENDERS ── */}
        <section style={{ padding: "30px 0 8px" }}>
          <h2 style={H2}>{`${category.contenders.length} more ${midSentence(category.nounPlural)}, ranked`}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
            {category.contenders.map((c, i) => (
              <ContenderCard key={c.key} contender={c} rank={i + 2} group={audience.group} />
            ))}
          </div>
        </section>

        {/* ── COMPARISON TABLE ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={H2}>Comparison table</h2>
          <div style={{ overflowX: "auto", border: `1px solid ${MKT.ink10}`, borderRadius: 16, background: "rgba(255,255,255,0.55)", marginTop: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontSize: 14.5 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: "22%" }}>{category.noun}</th>
                  <th style={{ ...TH, width: "26%" }}>Best for</th>
                  <th style={{ ...TH, width: "22%" }}>From price</th>
                  <th style={{ ...TH, width: "30%" }}>The catch</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...TD, background: MKT.green10, fontWeight: 800, color: MKT.green }}>SeldonFrame</td>
                  <td style={{ ...TD, background: MKT.green10, color: "rgba(34,29,23,0.85)", fontWeight: 500 }}>{category.intentLine}</td>
                  <td style={{ ...TD, background: MKT.green10, color: "rgba(34,29,23,0.85)", fontWeight: 500 }}>$29/mo flat solo, or $99–$299/mo agency (0% GMV)</td>
                  <td style={{ ...TD, background: MKT.green10, color: "rgba(34,29,23,0.85)", fontWeight: 500 }}>Newer platform; not a dedicated funnel-builder</td>
                </tr>
                {category.contenders.map((c) => (
                  <tr key={c.key}>
                    <td style={{ ...TD, fontWeight: 700 }}>{c.name}</td>
                    <td style={{ ...TD, color: "rgba(34,29,23,0.66)" }}>{emphasize(c.bestFor)}</td>
                    <td style={{ ...TD, color: "rgba(34,29,23,0.66)" }}>{emphasize(c.from)}</td>
                    <td style={{ ...TD, color: "rgba(34,29,23,0.66)" }}>{emphasize(c.watchOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── FREE-TIER SECTION (small-business / general audiences only) ── */}
        {audience.group === "general" && (
          <section id="free" style={{ padding: "38px 0 8px" }}>
            <h2 style={H2}>{`What about free ${midSentence(category.nounPlural)}?`}</h2>
            <p style={{ margin: "14px 0 0", fontSize: 15.5, lineHeight: 1.65, color: "rgba(34,29,23,0.78)", maxWidth: 760 }}>{category.freeAngle}</p>
            <p style={{ margin: "12px 0 0", fontSize: 15.5, lineHeight: 1.65, color: "rgba(34,29,23,0.78)", maxWidth: 760 }}>
              SeldonFrame&apos;s honest free-tier answer: the first workspace is free forever, and the whole build — site, CRM, booking, AI receptionist —
              is free and testable before you ever enter a card. The free build <em>is</em> the trial.
            </p>
          </section>
        )}

        {/* ── DECISION FRAMEWORK ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={H2}>{`Choose the right ${category.noun} for you`}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            {decisionFramework.map((d) => (
              <div key={d.name} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.5)" }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "rgba(34,29,23,0.78)" }}>
                  <strong>{`Choose ${d.name} if`}</strong> {emphasize(d.chooseIf)}.
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6, color: "rgba(34,29,23,0.6)" }}>
                  <strong>Skip it if</strong> {emphasize(d.skipIf)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={{ ...H2, marginBottom: 14 }}>Frequently asked questions</h2>
          {faqEntries.map((item) => (
            <details
              key={item.q}
              style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}
            >
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{item.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{item.a}</p>
            </details>
          ))}
        </section>

        {/* ── CROSS-LINKS ── */}
        <section style={{ padding: "30px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>More best-of pages</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {relatedPages.map((p) => {
              const resolved = getBestPage(bestSlug(p));
              return (
                <Link
                  key={bestSlug(p)}
                  href={`/best/${bestSlug(p)}`}
                  className="sf-link"
                  style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
                >
                  {`Best ${resolved.category.nounPlural} for ${resolved.audience.label}`}
                </Link>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {alternative && (
              <Link
                href={`/alternative-to-${alternative.slug}`}
                className="sf-link"
                style={{ fontSize: 13.5, fontWeight: 600, color: MKT.green, border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
              >
                {`SeldonFrame vs ${alternative.name}`}
              </Link>
            )}
            <Link
              href="/tools"
              className="sf-link"
              style={{ fontSize: 13.5, fontWeight: 600, color: MKT.green, border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
            >
              Free tools
            </Link>
          </div>
        </section>

        <BuildWidget ungatedBuildEnabled={isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })} />

        {/* ── FINAL CTA ── */}
        <section
          style={{ marginTop: 40, border: `1px solid ${MKT.ink10}`, borderRadius: 20, padding: "34px 32px", background: MKT.dark, color: MKT.paper, textAlign: "center" }}
        >
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {`See it working for your business before you pay anything`}
          </h2>
          <p style={{ margin: "10px auto 0", fontSize: 15.5, lineHeight: 1.6, color: "rgba(246,242,234,0.75)", maxWidth: 560 }}>
            Paste your website (or describe your business) and SeldonFrame builds the site, CRM, booking calendar and AI receptionist in
            about 3 minutes — free, before you sign up. Then it&apos;s $29/mo flat solo, or $99–$299/mo for agency white-label.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 22 }}>
            <a href={START_HREF} style={{ background: MKT.green, color: "#fff", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
              Start for free
            </a>
            <a href={DEMO_HREF} style={{ border: "1.5px solid rgba(246,242,234,0.3)", color: MKT.paper, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
              Book a demo call
            </a>
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

function ContenderCard({
  contender,
  rank,
  group,
}: {
  contender: BestContender;
  rank: number;
  group: BestAudience["group"];
}): ReactElement {
  const fitNote = contender.fitNotes?.[group];
  return (
    <div style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 16, padding: "20px 22px", background: "rgba(255,255,255,0.55)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(34,29,23,0.4)" }}>{`#${rank}`}</span>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{contender.name}</h3>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "rgba(34,29,23,0.55)" }}>
          {emphasize(contender.from)}
          {contender.sourceUrl && (
            <>
              {" "}
              <a
                href={contender.sourceUrl}
                rel="nofollow noopener"
                target="_blank"
                className="sf-link"
                style={{ fontSize: 12, fontWeight: 600, color: "rgba(34,29,23,0.4)", textDecoration: "underline" }}
              >
                (source)
              </a>
            </>
          )}
        </span>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{contender.oneLiner}</p>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.6)" }}>
        <strong style={{ color: "rgba(34,29,23,0.75)" }}>Best for:</strong> {contender.bestFor}
      </p>
      <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none" }}>
        {contender.strengths.map((s) => (
          <li key={s} style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", marginBottom: 5 }}>
            <span style={{ color: MKT.green, fontWeight: 800, marginRight: 7 }}>+</span>
            {s}
          </li>
        ))}
      </ul>
      <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "#C0392B" }}>
        <strong>Watch out:</strong> {contender.watchOut}
      </p>
      {fitNote && (
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "rgba(34,29,23,0.55)", fontStyle: "italic" }}>{fitNote}</p>
      )}
    </div>
  );
}

const H2: CSSProperties = { margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" };

const TH: CSSProperties = {
  textAlign: "left",
  padding: "14px 18px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.02em",
  borderBottom: "1px solid rgba(34,29,23,0.10)",
};

const TD: CSSProperties = {
  padding: "13px 18px",
  verticalAlign: "top",
  lineHeight: 1.5,
  borderBottom: "1px solid rgba(34,29,23,0.07)",
};

/** Scoped responsive tweaks (inline styles can't express media queries). */
function BestPageStyles(): ReactElement {
  return (
    <style>{`
      @media (max-width: 720px) {
        .sf-bestpage .sf-best-h1 { font-size: 30px !important; }
      }
    `}</style>
  );
}

// Named category type import kept for future consumers that need the full
// category shape (e.g. a future /best hub grid) — re-exported for convenience.
export type { BestCategory };
