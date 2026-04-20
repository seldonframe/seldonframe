import Link from "next/link";
import type { CTASectionContent } from "./types";

export function CTASection({ headline, body, ctaText, ctaLink }: CTASectionContent) {
  return (
    <section className="bg-muted/20 px-5 py-24">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-border bg-background/85 px-6 py-14 text-center md:px-10 md:py-16">
        <h2 className="text-3xl font-semibold text-foreground md:text-5xl">{headline}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">{body}</p>
        <Link href={ctaLink} className="crm-button-primary mt-8 h-12 px-8 text-sm md:text-base">
          {ctaText}
        </Link>
      </div>
    </section>
  );
}
