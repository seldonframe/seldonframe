// Server-rendered template for a /blog/<slug> long-form original article —
// the HTML twin of blog-markdown.ts. Renders inside MarketingShell using the
// same dark visual + `.marketing-prose` rhythm as the existing hand-coded
// posts (e.g. why-mcp), so registry articles are visually indistinguishable
// from hand-coded ones. One template renders every BlogArticle in the
// registry (data-driven, like GuidePage).

import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { MarketingShell } from "@/app/(marketing)/marketing-shell";
import { AUTHOR, articleLd, authorPersonLd } from "@/components/seo/author-byline";
import { getBlogArticle } from "@/lib/seo/blog";
import type { BlogCallout } from "@/lib/seo/blog/types";
import { tokenizeInlineMarkup, stripInlineMarkup, startsWithKindOfLike } from "@/lib/seo/guide-inline";

/** Split a section body into paragraphs on blank lines. */
function paragraphs(body: string): string[] {
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Render markdown-lite text into React nodes (bold/italic/internal links) —
 *  mirrors renderInlineMarkup in guide-page.tsx, styled for the dark blog
 *  chrome instead of the light MKT palette. */
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
            <Link key={i} href={token.href} className="text-[#1FAE85] hover:underline font-semibold">
              {token.label}
            </Link>
          );
        }
        // Non-internal hrefs render as plain text per the markup contract.
        return <span key={i}>{token.label}</span>;
      case "text":
        return <span key={i}>{token.text}</span>;
    }
  });
}

export { stripInlineMarkup };

const CALLOUT_META: Record<BlogCallout["kind"], { label: string; icon: string }> = {
  analogy: { label: "Kind of like…", icon: "💡" },
  tip: { label: "Tip", icon: "✅" },
  warning: { label: "Watch out", icon: "⚠️" },
};

function CalloutBox({ callout }: { callout: BlogCallout }): ReactElement {
  const meta = CALLOUT_META[callout.kind];
  const skipLabel = callout.kind === "analogy" && startsWithKindOfLike(callout.text);
  return (
    <div className="my-6 flex gap-3 items-start rounded-[12px] border border-white/10 bg-white/[0.03] px-5 py-4">
      <span aria-hidden className="text-[17px] leading-[1.5] flex-none">
        {meta.icon}
      </span>
      <p className="m-0 text-[14.5px] leading-[1.6] text-[#d4d4d8]">
        {!skipLabel && (
          <>
            <strong className="font-extrabold text-[#fafafa]">{meta.label}</strong>
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

/** Extract a bare domain from a source URL (for the plain-text sources list). */
function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
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
  // FAQPage JSON-LD — parity with /guides (guide-page.tsx). Only when the
  // article carries FAQ (blog faq is optional, unlike guides' required faq).
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

  return (
    <MarketingShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
      <article className="max-w-[720px] mx-auto px-5 md:px-12 py-16 md:py-24">
        <header className="mb-12">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-3">
            {formatDate(a.date)} · {authorName}
          </p>
          <h1 className="text-[clamp(30px,4vw,46px)] font-bold tracking-[-0.035em] text-[#fafafa] mb-4 leading-[1.1]">
            {a.title}
          </h1>
          <p className="text-[17px] text-[#a1a1aa] leading-[1.7]">{renderInlineMarkup(a.dek)}</p>
        </header>

        {a.sourceVideo && (
          <p className="text-[13.5px] text-[#a1a1aa] leading-[1.7] mb-10 -mt-6">
            Source:{" "}
            <a href={a.sourceVideo.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[#1FAE85] hover:underline font-semibold">
              {a.sourceVideo.title}
            </a>{" "}
            — {a.sourceVideo.channel}
            {a.sourceVideo.timestamp ? ` (${a.sourceVideo.timestamp})` : ""}
          </p>
        )}

        <div className="marketing-prose">
          {a.sections.map((s) => (
            <section key={s.h2}>
              <h2>{s.h2}</h2>
              {paragraphs(s.body).map((p, i) => (
                <p key={i}>{renderInlineMarkup(p)}</p>
              ))}
              {s.callout && <CalloutBox callout={s.callout} />}
            </section>
          ))}
        </div>

        {a.faq && a.faq.length > 0 && (
          <section className="mt-14">
            <h2 className="text-[22px] font-bold tracking-[-0.02em] text-[#fafafa] mb-4">Frequently asked questions</h2>
            {a.faq.map((f) => (
              <details key={f.q} className="border border-white/10 rounded-[12px] px-[18px] py-[14px] mb-2.5 bg-white/[0.02]">
                <summary className="font-bold text-[15.5px] text-[#fafafa] cursor-pointer">{renderInlineMarkup(f.q)}</summary>
                <p className="mt-2.5 mb-0 text-[14.5px] leading-[1.65] text-[#a1a1aa]">{renderInlineMarkup(f.a)}</p>
              </details>
            ))}
          </section>
        )}

        {a.sources.length > 0 && (
          <section className="mt-10">
            <h2 className="text-[18px] font-bold text-[#fafafa] mb-3">Sources</h2>
            <ul className="pl-[18px] text-[14px] leading-[1.7] text-[#a1a1aa]">
              {a.sources.map((src) => {
                const domain = domainFromUrl(src.url);
                return (
                  <li key={src.url} className="mb-1">
                    <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[#1FAE85] hover:underline font-semibold">
                      {src.label}
                    </a>
                    {domain && <span className="text-[#71717a]"> ({domain})</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(a.relatedTool || a.relatedGuide) && (
          <p className="mt-8 text-[14.5px] leading-[1.6] text-[#a1a1aa]">
            {a.relatedTool && (
              <>
                Related free tool:{" "}
                <Link href={a.relatedTool} className="text-[#1FAE85] hover:underline font-semibold">
                  open it
                </Link>
                .{" "}
              </>
            )}
            {a.relatedGuide && (
              <>
                Go deeper:{" "}
                <Link href={a.relatedGuide} className="text-[#1FAE85] hover:underline font-semibold">
                  the full guide
                </Link>
                .
              </>
            )}
          </p>
        )}

        <footer className="mt-16 pt-8 border-t border-white/5 flex items-center justify-between text-[14px]">
          <Link href="/blog" className="text-[#71717a] hover:text-[#fafafa] transition-colors">
            ← All posts
          </Link>
        </footer>
      </article>
    </MarketingShell>
  );
}
