import Link from "next/link";
import { EmbeddableWidget, PoweredByBadge } from "@seldonframe/core/virality";
import type { LandingSection } from "@/lib/landing/types";
import { LandingLeadForm } from "./landing-lead-form";

type Props = {
  sections: LandingSection[];
  orgSlug: string;
  pageSlug: string;
};

function ListSection({ title, items }: { title?: string; items?: string[] }) {
  return (
    <section className="crm-card space-y-3">
      {title ? <h2 className="text-section-title">{title}</h2> : null}
      <ul className="list-disc space-y-1 pl-5 text-[hsl(var(--color-text-secondary))]">
        {(items ?? []).map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function LandingSectionRenderer({ sections, orgSlug, pageSlug }: Props) {
  return (
    <main className="crm-page mx-auto w-full max-w-4xl space-y-4 py-8">
      {sections.map((section) => {
        switch (section.type) {
          case "hero":
            return (
              <section key={section.id} className="crm-card space-y-3 text-center">
                <h1 className="text-page-title">{section.title}</h1>
                {section.subtitle ? <p className="text-[hsl(var(--color-text-secondary))]">{section.subtitle}</p> : null}
                {section.ctaLabel && section.ctaHref ? (
                  <div>
                    <Link href={section.ctaHref} className="crm-button-primary inline-flex h-10 items-center px-4">
                      {section.ctaLabel}
                    </Link>
                  </div>
                ) : null}
              </section>
            );
          case "social_proof":
          case "features":
          case "benefits":
          case "testimonials":
          case "pricing":
          case "faq":
            return <ListSection key={section.id} title={section.title} items={section.items} />;
          case "cta":
            return (
              <section key={section.id} id="cta" className="crm-card space-y-3 text-center">
                {section.title ? <h2 className="text-section-title">{section.title}</h2> : null}
                {section.ctaLabel && section.ctaHref ? (
                  <div>
                    <Link href={section.ctaHref} className="crm-button-primary inline-flex h-10 items-center px-4">
                      {section.ctaLabel}
                    </Link>
                  </div>
                ) : null}
              </section>
            );
          case "form":
            return (
              <section key={section.id} className="space-y-3">
                {section.title ? <h2 className="text-section-title">{section.title}</h2> : null}
                {section.subtitle ? <p className="text-[hsl(var(--color-text-secondary))]">{section.subtitle}</p> : null}
                <LandingLeadForm orgSlug={orgSlug} pageSlug={pageSlug} />
              </section>
            );
          case "booking":
            return (
              <section key={section.id} id="book" className="crm-card space-y-3">
                {section.title ? <h2 className="text-section-title">{section.title}</h2> : null}
                {section.subtitle ? <p className="text-[hsl(var(--color-text-secondary))]">{section.subtitle}</p> : null}
                <Link href={`/book/${orgSlug}/${section.bookingSlug ?? "default"}`} className="crm-button-primary inline-flex h-10 items-center px-4">
                  Book a call
                </Link>
              </section>
            );
          case "custom_html":
            return (
              <section key={section.id} className="crm-card space-y-3">
                {section.title ? <h2 className="text-section-title">{section.title}</h2> : null}
                {section.html ? <EmbeddableWidget title="Embedded Section" iframeSrc={section.html} /> : null}
              </section>
            );
          default:
            return null;
        }
      })}

      <div className="flex justify-center pt-2">
        <PoweredByBadge />
      </div>
    </main>
  );
}
