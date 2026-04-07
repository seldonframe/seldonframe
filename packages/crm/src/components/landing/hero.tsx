"use client";

import { UrlAnalyzer } from "@/components/landing/url-analyzer";

export function LandingHero() {
  return (
    <section className="flex flex-col items-center justify-center px-6 py-40 text-center md:py-56">
      <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-zinc-100 md:text-6xl lg:leading-[1.1]">
        Paste your website.
        <br />
        Your business system builds itself.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
        SeldonFrame reads your site and builds your CRM, booking, forms, and emails. Everything connected. Everything
        sounds like you.
      </p>

      <div className="mt-12 w-full max-w-2xl">
        <UrlAnalyzer />
      </div>
    </section>
  );
}
