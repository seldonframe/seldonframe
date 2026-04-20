import type { FAQSectionContent } from "./types";

export function FAQSection({ headline, faqs }: FAQSectionContent) {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <h2 className="text-center text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
        <div className="space-y-3">
          {faqs.map((item, index) => (
            <details key={`${item.question}-${index}`} className="rounded-xl border bg-card p-5">
              <summary className="cursor-pointer text-base font-medium text-foreground">{item.question}</summary>
              <p className="mt-3 text-base text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
