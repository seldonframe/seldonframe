import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

// Cut C Phase 1 — Hero refresh.
//
// The previous hero embedded <UrlAnalyzer /> for anonymous URL paste.
// That moment now lives at /clients/new (Cut A), reached after signup.
// Hero's job here is to funnel signed-out agency visitors into
// /signup. Two CTAs: primary "Sign Up Free" → /signup, secondary
// "Continue in Claude Code" → /docs/getting-started/connect-claude-code
// for the MCP-native crowd.
export function LandingHero() {
  return (
    <section className="mx-auto flex max-w-5xl flex-col items-center justify-center px-6 py-20 text-center md:py-28">
      <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-zinc-100 md:text-6xl lg:leading-[1.1]">
        Spin up an agency-ready Business OS in 60 seconds. Open source. Your Anthropic key.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
        Paste your client&apos;s URL. SeldonFrame builds their CRM, booking page, intake form, and AI chatbot —
        wired up, white-label, ready to hand over.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 rounded-xl bg-[#14b8a6] px-10 py-4 font-semibold text-white transition-opacity hover:opacity-90"
        >
          Start free
          <ArrowRight size={18} />
        </Link>
        <Link
          href="/docs/getting-started/connect-claude-code"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-8 py-4 font-semibold text-zinc-200 transition-colors hover:border-zinc-500"
        >
          Set up via Claude Code
        </Link>
      </div>
      <p className="mt-6 text-sm text-zinc-500">Free forever — 1 workspace, BYO Anthropic key, no credit card.</p>

      <div className="mt-12 w-full max-w-4xl overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-900">
        <Image
          src="/marketing/hero-loop.gif"
          alt="A 6-second loop of an operator pasting a URL and watching a SeldonFrame workspace appear: CRM, booking page, intake form, and AI chatbot."
          width={1280}
          height={720}
          className="h-auto w-full motion-reduce:hidden"
          unoptimized
          priority
        />
        <div className="hidden h-[60px] items-center justify-center bg-zinc-900 px-6 text-sm text-zinc-500 motion-reduce:flex">
          A 6-second loop shows: paste URL → CRM, booking page, intake form, and AI chatbot appear.
        </div>
        <p className="border-t border-zinc-800/50 bg-zinc-950 px-6 py-3 text-center text-xs text-zinc-500">
          Live 6-second hero loop lands in week 6.
        </p>
      </div>
    </section>
  );
}
