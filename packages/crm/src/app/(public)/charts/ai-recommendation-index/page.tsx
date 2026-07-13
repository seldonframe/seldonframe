// /charts/ai-recommendation-index — "The AI Recommendation Index": a
// monthly-snapshot leaderboard of which software brands AI engines actually
// recommend for small-service-business jobs. v1 measures one engine
// (Claude, sonnet, n=1 per question) across 10 fixed buyer questions — see
// lib/seo/ai-reco-index-data.ts for the full registry and methodology, and
// docs/strategy/ai-reco-index/2026-07-09-raw.md for the verbatim raw
// outputs every score traces back to. Google AI Overviews was attempted via
// DataForSEO and did not ship in v1 (documented honestly below) — never
// fabricated to fill the gap.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { MarkdownPointer } from "@/components/seo/markdown-pointer";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { AiRecoIndexLeaderboard } from "@/components/seo/ai-reco-index";
import { QUESTIONS, SNAPSHOT_DATE, SNAPSHOT_LABEL, METHODOLOGY, buildLeaderboard } from "@/lib/seo/ai-reco-index-data";
import { buildOgUrl } from "@/lib/seo/og-card";

const TITLE = "The AI Recommendation Index — which software AI actually recommends to service businesses (July 2026 snapshot)";
const DESCRIPTION =
  "10 fixed buyer questions, run through Claude and scored into a ranked leaderboard: which CRM, booking, voice-AI and all-in-one tools AI engines actually recommend for small service businesses. Every score traces back to a raw answer.";
const CANONICAL_PATH = "/charts/ai-recommendation-index";

const OG_URL = buildOgUrl({
  kind: "tool",
  name: "The AI Recommendation Index",
  hook: "Which software AI actually recommends",
});

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: CANONICAL_PATH,
    types: { "text/markdown": `${CANONICAL_PATH}.md` },
  },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CANONICAL_PATH, type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

const FAQ = [
  {
    q: "Is this a real benchmark?",
    a: "No — it's a snapshot. Each question is asked once (n=1) per engine on a given date. LLM answers vary run to run, so a single sample isn't a statistically rigorous benchmark. We publish it anyway because directionally it's still useful, and because the alternative (nobody measuring this at all) is worse than an honestly-labeled n=1 snapshot.",
  },
  {
    q: "Which AI engines does this cover?",
    a: "v1 covers one: Claude (Anthropic's sonnet model, queried via the Claude CLI). We attempted to add a Google AI Overviews column via the DataForSEO SERP API on the same date, but Google did not render an AI Overview block for these queries at request time, and we hit unreliable connectivity partway through the batch. Rather than fabricate that column with organic-results data mislabeled as an AI Overview, we shipped v1 Claude-only and documented the attempt in full.",
  },
  {
    q: "How is the score calculated?",
    a: "Each engine returns a ranked list of up to 5 products per question. Rank 1 earns 5 points, rank 2 earns 4, down to rank 5 earning 1 point. A brand's total score is the sum of its points across every question and every engine it appeared in. Every scored point traces back to a specific question + rank — there's a raw-answer receipt for every number on this page.",
  },
  {
    q: "Does SeldonFrame appear on this list?",
    a: "Not in the July 2026 snapshot. SeldonFrame did not appear in any of Claude's 10 answers. We're publishing that fact as-is rather than nudging the questions or the scoring to include ourselves — the absence is the honest headline, and we build one of the tools these questions are about (see the disclosure below).",
  },
  {
    q: "Why publish something that could make your own product look bad?",
    a: "Because a rigged leaderboard is worthless to the people reading it, and because SeldonFrame's whole positioning is never-lies — grounded claims, no nudged evidence. If we're going to publish a \"what does AI actually recommend\" page, it has to be one we'd trust if a competitor published it about us.",
  },
  {
    q: "How often is this updated?",
    a: "Monthly, in principle — the fixed 10-question prompt set and scoring script (scripts/ai-reco-snapshot.mjs) are reusable, so future snapshots can be regenerated on the same methodology and compared over time. Each snapshot is dated; historical snapshots are not silently overwritten.",
  },
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

export default function AiRecommendationIndexPage(): ReactElement {
  const leaderboard = buildLeaderboard();
  const top10 = leaderboard.slice(0, 10);

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripHtml(f.a) } })),
  };
  const articleJsonLd = articleLd({
    headline: TITLE,
    description: DESCRIPTION,
    canonicalPath: CANONICAL_PATH,
    dateModified: SNAPSHOT_DATE,
  });

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <MarkdownPointer href={`${CANONICAL_PATH}.md`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/charts" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Charts
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>AI recommendation index</span>
        </nav>

        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
          {`${SNAPSHOT_LABEL} snapshot · n=1 per question`}
        </div>
        <h1 style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, maxWidth: 820 }}>
          The AI Recommendation Index
        </h1>
        <p style={{ margin: "16px 0 0", fontSize: 18, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 720 }}>
          Which software brands does AI actually recommend for small-service-business jobs? We asked 10 fixed buyer
          questions and scored the ranked answers into a leaderboard. v1 measures one engine — Claude — honestly and
          in full.
        </p>
        <AuthorByline checked={SNAPSHOT_LABEL} />

        {/* ── disclosure ── */}
        <div style={{ marginTop: 24, display: "grid", gap: 12, maxWidth: 780 }}>
          <div style={{ border: `1px solid ${MKT.ink10}`, borderLeftWidth: 3, borderLeftColor: MKT.green, borderRadius: 12, padding: "14px 18px", background: "rgba(5, 150, 105,0.05)" }}>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.8)" }}>
              <strong>Self-interest, disclosed:</strong> I build SeldonFrame, one of the tools these questions are
              about. SeldonFrame did not appear in any of the 10 Claude answers in this snapshot — we're publishing
              that absence as-is, not nudging it away.
            </p>
          </div>
          <div style={{ border: `1px solid ${MKT.ink10}`, borderLeftWidth: 3, borderLeftColor: "#B8860B", borderRadius: 12, padding: "14px 18px", background: "rgba(184,134,11,0.05)" }}>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.8)" }}>
              <strong>Answers vary run to run.</strong> This is a snapshot (n=1 per question), not a benchmark. Read
              the methodology below before treating any single rank as definitive.
            </p>
          </div>
        </div>

        {/* ── leaderboard ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Leaderboard</h2>
          <AiRecoIndexLeaderboard />
        </section>

        {/* ── methodology ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Methodology</h2>
          <div style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.75)", maxWidth: 780 }}>
            <p>
              We ask the same 10 fixed buyer questions every snapshot, unchanged, so results are comparable month to
              month:
            </p>
            <ol style={{ paddingLeft: 22 }}>
              {QUESTIONS.map((q) => (
                <li key={q.id} style={{ marginBottom: 4 }}>
                  &ldquo;{q.text}&rdquo;
                </li>
              ))}
            </ol>
            <p>
              <strong>Claude column:</strong> each question run once through{" "}
              <code style={{ background: "rgba(34,29,23,0.06)", padding: "1px 6px", borderRadius: 4 }}>
                {METHODOLOGY.claudeModel}
              </code>{" "}
              with the suffix &ldquo;Answer with a ranked list of up to 5 specific products and one line why
              each.&rdquo; {METHODOLOGY.claudeSampling}.
            </p>
            <p>
              <strong>Google AI Overviews column:</strong> {METHODOLOGY.googleAiOverviewStatus}
            </p>
            <p>
              <strong>Scoring:</strong> {METHODOLOGY.scoring}. Brand names are normalized before scoring (for
              example &ldquo;GoHighLevel&rdquo;, &ldquo;HighLevel&rdquo; and &ldquo;GHL&rdquo; all collapse to one
              brand). Every scored point traces back to a specific question + rank in the raw output archive.
            </p>
            <p>
              <strong>{METHODOLOGY.caveat}</strong> Full verbatim raw outputs for this snapshot are archived at{" "}
              <code style={{ background: "rgba(34,29,23,0.06)", padding: "1px 6px", borderRadius: 4 }}>
                {METHODOLOGY.rawOutputsPath}
              </code>{" "}
              so every score is independently auditable.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{f.a}</p>
            </details>
          ))}
        </section>

        {/* ── internal links ── */}
        <section style={{ padding: "20px 0 8px" }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            Want the per-business version of this?{" "}
            <Link href="/tools/ai-visibility-checker" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              Check whether AI recommends your business
            </Link>
            . More reading:{" "}
            <Link href="/guides/one-person-company-os" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the one-person company OS
            </Link>
            , or{" "}
            <Link href="/best/crm-for-small-business" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the best CRMs for small business
            </Link>
            .
          </p>
        </section>

        {/* ── CTA ── */}
        <section style={{ marginTop: 30, border: `1px solid ${MKT.ink10}`, borderRadius: 20, padding: "34px 32px", background: MKT.dark, color: MKT.paper, textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {top10.length > 0 ? `#1 this snapshot: ${top10[0].brand}` : "Build the front office AI actually recommends"}
          </h2>
          <p style={{ margin: "10px auto 0", fontSize: 15.5, lineHeight: 1.6, color: "rgba(246,242,234,0.75)", maxWidth: 560 }}>
            SeldonFrame builds your CRM, booking calendar, intake form and AI receptionist in one conversation — free,
            before you sign up.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 22 }}>
            <a href="/signup" style={{ background: MKT.green, color: "#fff", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
              Start for free
            </a>
            <a
              href="https://app.seldonframe.com/book/seldonframes-workspace-7798/default"
              style={{ border: "1.5px solid rgba(246,242,234,0.3)", color: MKT.paper, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}
            >
              Book a demo call
            </a>
          </div>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
