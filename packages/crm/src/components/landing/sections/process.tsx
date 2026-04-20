import type { ProcessSectionContent } from "./types";

export function ProcessSection({ headline, steps }: ProcessSectionContent) {
  return (
    <section className="bg-muted/20 px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <h2 className="text-center text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={`${step.title}-${index}`} className="relative">
              <article className="rounded-xl border bg-card p-6 text-center md:p-7">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {step.number}
                </div>
                <h3 className="mt-4 text-lg font-medium text-foreground">{step.title}</h3>
                <p className="mt-2 text-base text-muted-foreground">{step.description}</p>
              </article>
              {index < steps.length - 1 ? (
                <span className="pointer-events-none absolute -right-2 top-1/2 hidden h-px w-4 bg-border md:block" aria-hidden="true" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
