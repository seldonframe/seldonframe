import { Star } from "lucide-react";
import Image from "next/image";
import type { TestimonialsSectionContent } from "./types";

export function TestimonialsSection({ headline, testimonials }: TestimonialsSectionContent) {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <h2 className="text-center text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {testimonials.map((item, index) => (
            <article key={`${item.author}-${index}`} className="rounded-xl border bg-card p-6 md:p-7">
              {item.rating ? (
                <div className="mb-3 flex items-center gap-1 text-caution" aria-label={`${item.rating} star rating`}>
                  {Array.from({ length: Math.max(1, Math.min(5, item.rating)) }).map((_, starIndex) => (
                    <Star key={`${item.author}-star-${starIndex}`} className="h-4 w-4 fill-current" />
                  ))}
                </div>
              ) : null}

              <p className="text-base text-foreground">“{item.quote}”</p>

              <div className="mt-4 flex items-center gap-3">
                {item.avatar ? (
                  <Image src={item.avatar} alt={item.author} width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--muted)/0.6)] text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    {item.author.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{item.author}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
