"use client";

import { UrlAnalyzer } from "@/components/landing/url-analyzer";

export function LandingHero() {
  return (
    <section className="flex flex-col items-center justify-center px-6 py-32 text-center">
      <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-zinc-100 md:text-6xl lg:leading-[1.1]">
        Paste your website.
        <br />
        Your business system builds itself.
      </h1>
      <p className="mx-auto mt-8 max-w-2xl text-lg text-zinc-400">
        SeldonFrame reads your site, sets up your CRM, booking page, forms, and emails. Everything talks to each
        other. Everything sounds like you.
      </p>

      <div className="mt-12 w-full max-w-2xl">
        <UrlAnalyzer />
        <div className="mt-4 flex items-center justify-center gap-3 text-xs">
          <span className="text-zinc-600">Try an example:</span>
          {["mycoachingsite.com", "brightwaterplumbing.com", "zenflowstudio.com"].map((url) => (
            <button key={url} className="text-zinc-500 transition-colors hover:text-zinc-300">
              {url}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
