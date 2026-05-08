// /blog — index of launch-week posts.
// v1.31.3 — replaced "Coming soon" stub with a real 3-post index.
// Posts that are written link to /blog/<slug>; the others use
// "Coming soon" markers without breaking the visual rhythm.

import type { Metadata } from "next";
import { MarketingShell } from "../marketing-shell";

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

const POSTS: Post[] = [
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

export default function BlogIndexPage() {
  return (
    <MarketingShell>
      <article className="max-w-[920px] mx-auto px-5 md:px-12 py-16 md:py-24">
        <header className="mb-14">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-3">Blog</p>
          <h1 className="text-[clamp(32px,4.5vw,52px)] font-bold tracking-[-0.035em] text-[#fafafa] mb-4 leading-[1.1]">
            Notes from the build
          </h1>
          <p className="text-[16px] text-[#a1a1aa] leading-[1.7] max-w-[640px]">
            How SeldonFrame is built, why we made the architecture choices we
            did, and what we learn from dogfooding it on real customer
            operations.
          </p>
        </header>

        <div className="space-y-6">
          {POSTS.map((post) => {
            const card = (
              <div
                className={`group relative rounded-[12px] border border-white/5 bg-[#111113] p-6 md:p-8 transition-all ${
                  post.status === "live"
                    ? "hover:border-[#1FAE85]/40 hover:-translate-y-[2px]"
                    : "opacity-70"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[12px] font-mono text-[#71717a]">{post.date}</span>
                  <span className="text-[12px] text-[#3f3f46]">·</span>
                  <span className="text-[12px] text-[#71717a]">{post.author}</span>
                  {post.status === "soon" && (
                    <span className="ml-auto text-[10px] uppercase tracking-[0.08em] font-mono text-[#71717a] px-2 py-0.5 rounded-full border border-white/10">
                      Coming soon
                    </span>
                  )}
                </div>
                <h2
                  className={`text-[20px] md:text-[22px] font-bold tracking-[-0.025em] leading-[1.2] mb-3 text-[#fafafa] ${
                    post.status === "live" ? "group-hover:text-[#1FAE85] transition-colors" : ""
                  }`}
                >
                  {post.title}
                </h2>
                <p className="text-[14px] text-[#a1a1aa] leading-[1.7]">{post.lede}</p>
                {post.status === "live" && (
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-[#1FAE85] font-semibold group-hover:gap-2 transition-all">
                    Read post <span>&rarr;</span>
                  </span>
                )}
              </div>
            );

            return post.status === "live" ? (
              <a key={post.slug} href={`/blog/${post.slug}`} className="block">
                {card}
              </a>
            ) : (
              <div key={post.slug}>{card}</div>
            );
          })}
        </div>

        <div className="mt-16 pt-10 border-t border-white/5 text-center">
          <p className="text-[14px] text-[#a1a1aa] leading-[1.7]">
            Follow{" "}
            <a
              href="https://x.com/seldonframe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1FAE85] hover:underline font-semibold"
            >
              @seldonframe on 𝕏
            </a>{" "}
            for new posts, or join the{" "}
            <a
              href="https://discord.gg/sbVUu976NW"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1FAE85] hover:underline font-semibold"
            >
              Discord
            </a>{" "}
            to talk to the team.
          </p>
        </div>
      </article>
    </MarketingShell>
  );
}
