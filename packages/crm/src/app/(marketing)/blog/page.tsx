// /blog — index of build-notes + information-gain articles.
// Light marketplace parchment theme (matches the article page + /guides), NOT
// MarketingShell's dark chrome — so the index reads dark-ink-on-parchment and
// clicking through to an article keeps the same look.

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { articlesNewestFirst } from "@/lib/seo/blog";
import { AUTHOR } from "@/components/seo/author-byline";

export const metadata: Metadata = {
  title: "Blog — SeldonFrame",
  description:
    "Notes on building SeldonFrame: MCP architecture, eval-gated agents, durable workflows, and dogfooding the platform on real businesses.",
};

type Post = {
  slug: string;
  title: string;
  lede: string;
  date: string;
  author: string;
  status: "live" | "soon";
};

const HAND_CODED_POSTS: Post[] = [
  {
    slug: "why-mcp",
    title: "Why we built SeldonFrame on MCP",
    lede:
      "Most AI startups wrap a single chatbot UI around an LLM. We took the opposite bet: expose the whole product as MCP tools and let Claude Code be the chrome. Here's why.",
    date: "May 7, 2026",
    author: "SeldonFrame Team",
    status: "live",
  },
  {
    slug: "eval-gate",
    title: "How the eval gate works (and why agents need one)",
    lede:
      "A chatbot that hallucinates a price or claims it booked an appointment when it didn't isn't a bug — it's a real-money problem. The 8-scenario suite, the LLM-as-judge rubric, and the runtime regeneration that catches what the suite misses.",
    date: "Coming soon",
    author: "SeldonFrame Team",
    status: "soon",
  },
  {
    slug: "byok-economics",
    title: "BYOK is not a feature, it's the deal",
    lede:
      "Why SeldonFrame doesn't markup tokens, doesn't pool LLM access, and doesn't ration by tier. The economics work better when the customer owns the provider relationship.",
    date: "Coming soon",
    author: "SeldonFrame Team",
    status: "soon",
  },
];

/** Registry articles (the data-driven engine) rendered as the same Post shape,
 *  newest-first. Deduped by slug against HAND_CODED_POSTS. */
function registryPosts(): Post[] {
  const handCodedSlugs = new Set(HAND_CODED_POSTS.map((p) => p.slug));
  return articlesNewestFirst()
    .filter((a) => !handCodedSlugs.has(a.slug))
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      lede: a.dek,
      date: new Date(`${a.date}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
      author: a.author ?? AUTHOR.name,
      status: "live" as const,
    }));
}

// Live articles first (registry, newest-first, are the real content), then the
// hand-coded live post, then the "coming soon" stubs — so the index leads with
// what a reader can actually open.
const REGISTRY = registryPosts();
const HAND_LIVE = HAND_CODED_POSTS.filter((p) => p.status === "live");
const SOON = HAND_CODED_POSTS.filter((p) => p.status === "soon");
const POSTS: Post[] = [...REGISTRY, ...HAND_LIVE, ...SOON];

const INDEX_CSS = `.sf-blog-card{transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}
a.sf-blog-link:hover .sf-blog-card{transform:translateY(-2px);border-color:rgba(5, 150, 105,0.45);box-shadow:0 10px 30px -18px rgba(34,29,23,0.35)}
a.sf-blog-link:hover .sf-blog-cta{gap:9px}`;

function PostCard({ post }: { post: Post }): ReactElement {
  const isLive = post.status === "live";
  const muted = "rgba(34,29,23,0.55)";
  return (
    <div
      className={isLive ? "sf-blog-card" : undefined}
      style={{
        border: `1px solid ${MKT.ink10}`,
        borderRadius: 14,
        background: isLive ? "#fff" : "rgba(255,255,255,0.45)",
        padding: "22px 24px",
        opacity: isLive ? 1 : 0.82,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, fontFamily: MKT.fontMono, color: muted }}>{post.date}</span>
        <span style={{ color: "rgba(34,29,23,0.3)" }}>·</span>
        <span style={{ fontSize: 12.5, color: muted }}>{post.author}</span>
        {!isLive && (
          <span style={{ marginLeft: "auto", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: MKT.fontMono, color: muted, padding: "3px 9px", borderRadius: 999, border: `1px solid ${MKT.ink10}` }}>
            Coming soon
          </span>
        )}
      </div>
      <h2 style={{ margin: 0, fontFamily: MKT.fontSerif, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.22, color: MKT.ink, marginBottom: 10 }}>
        {post.title}
      </h2>
      <p style={{ margin: 0, fontSize: 14.5, color: "rgba(34,29,23,0.72)", lineHeight: 1.62 }}>{post.lede}</p>
      {isLive && (
        <span className="sf-blog-cta" style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, color: MKT.green, fontWeight: 700, transition: "gap .15s ease" }}>
          Read post <span aria-hidden>&rarr;</span>
        </span>
      )}
    </div>
  );
}

export default function BlogIndexPage(): ReactElement {
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <style dangerouslySetInnerHTML={{ __html: INDEX_CSS }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 32px 72px", width: "100%" }}>
        <header style={{ marginBottom: 40 }}>
          <p style={{ margin: 0, fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(34,29,23,0.5)", fontFamily: MKT.fontMono, marginBottom: 12 }}>Blog</p>
          <h1 style={{ margin: 0, fontFamily: MKT.fontSerif, fontSize: "clamp(32px,5vw,52px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.08, color: MKT.ink, marginBottom: 14 }}>
            Notes from the build
          </h1>
          <p style={{ margin: 0, fontSize: 17, color: "rgba(34,29,23,0.7)", lineHeight: 1.6, maxWidth: 660 }}>
            How SeldonFrame is built, why we made the architecture choices we did, and what we learn from real founders shipping agents — plus original stories mined from the people actually doing it.
          </p>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {POSTS.map((post) =>
            post.status === "live" ? (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="sf-blog-link" style={{ textDecoration: "none", display: "block", color: "inherit" }}>
                <PostCard post={post} />
              </Link>
            ) : (
              <div key={post.slug}>
                <PostCard post={post} />
              </div>
            ),
          )}
        </div>

        <div style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${MKT.ink10}`, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(34,29,23,0.7)", lineHeight: 1.6 }}>
            Follow{" "}
            <a href="https://x.com/seldonframe" target="_blank" rel="noopener noreferrer" style={{ color: MKT.green, fontWeight: 700, textDecoration: "none" }}>
              @seldonframe on 𝕏
            </a>{" "}
            for new posts, or join the{" "}
            <a href="https://discord.gg/sbVUu976NW" target="_blank" rel="noopener noreferrer" style={{ color: MKT.green, fontWeight: 700, textDecoration: "none" }}>
              Discord
            </a>{" "}
            to talk to the team.
          </p>
        </div>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
