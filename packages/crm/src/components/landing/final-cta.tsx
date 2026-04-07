"use client";

import { ArrowRight } from "lucide-react";

export function LandingFinalCta() {
  return (
    <section className="border-t border-zinc-800/30 py-20 text-center">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">You already have a website. That&apos;s all Seldon needs.</h2>
        <p className="mt-4 text-lg text-zinc-400">Paste your URL. See what Seldon builds. No account needed.</p>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#14b8a6] px-10 py-4 font-semibold text-white transition-opacity hover:opacity-90"
        >
          Try it now <ArrowRight size={18} className="rotate-[-45deg]" />
        </button>
        <p className="mt-6 text-xs text-zinc-600">Free. No credit card. No setup.</p>
      </div>
    </section>
  );
}
