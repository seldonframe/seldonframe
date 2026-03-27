import { GitFork, Monitor, Wand2 } from "lucide-react";
import { Reveal } from "@/components/reveal";

export function ForBuilders() {
  const cards = [
    {
      icon: GitFork,
      title: "Fork → Deploy → Live in 10 minutes",
      desc: "One-click Vercel deploy. Set 3 env vars. Done.",
    },
    {
      icon: Wand2,
      title: "Customize by describing what you want",
      desc: "The .cursorrules file means your AI editor understands the entire codebase.",
    },
    {
      icon: Monitor,
      title: "Manage 50 clients from one dashboard",
      desc: "SeldonFrame Pro: one-click provisioning, white-label, revenue tracking.",
    },
  ] as const;

  return (
    <section className="web-section">
      <div className="web-container rounded-2xl bg-[hsl(var(--color-surface-raised))/0.2] p-6 md:p-10">
        <p className="section-label text-center">For Builders</p>
        <h2 className="text-center text-[32px] font-semibold tracking-[-0.02em]">Deploy for your clients. Charge $2,000.</h2>
        <p className="mx-auto mt-3 max-w-[560px] text-center text-[hsl(var(--color-text-secondary))]">
          SeldonFrame is open source. Fork it, customize it with your AI editor, deploy for clients.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((card, idx) => (
            <Reveal key={card.title} delayMs={idx * 80}>
              <article className="glass-card rounded-2xl p-5">
                <card.icon className="h-6 w-6 text-primary" />
                <p className="mt-3 text-[18px] font-semibold">{card.title}</p>
                <p className="mt-2 text-sm text-[hsl(var(--color-text-secondary))]">{card.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="https://github.com/seldonframe/crm" className="inline-flex h-12 items-center rounded-lg border border-primary px-5 text-sm font-semibold text-primary transition hover:bg-primary/10">
            View on GitHub →
          </a>
          <a href="#pricing" className="glow-teal inline-flex h-12 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:-translate-y-px">
            Learn about Pro →
          </a>
        </div>
      </div>
    </section>
  );
}
