import Image from "next/image";
import type { WhoItsForSectionContent } from "./types";

export function WhoItsForSection({ headline, personas }: WhoItsForSectionContent) {
  return (
    <section className="bg-[hsl(var(--muted)/0.2)] px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <h2 className="text-center text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {personas.map((persona, index) => (
            <article key={`${persona.name}-${index}`} className="glass-card rounded-2xl p-6 md:p-7">
              {persona.avatar ? (
                <Image src={persona.avatar} alt={persona.name} width={48} height={48} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted)/0.6)] text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  {persona.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <h3 className="mt-3 text-lg font-medium text-foreground">{persona.name}</h3>
              <p className="mt-2 text-base text-[hsl(var(--muted-foreground))]">{persona.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
