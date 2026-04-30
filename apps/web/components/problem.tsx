import { Layers, MailX, Unlink } from "lucide-react";

export function Problem() {
  const cards = [
    {
      icon: Unlink,
      title: "Your CRM doesn't know about your bookings.",
      desc: "A client books a session. Your CRM has no idea.",
    },
    {
      icon: MailX,
      title: "Your email tool doesn't know who your clients are.",
      desc: "You're sending campaigns to people who already bought.",
    },
    {
      icon: Layers,
      title: "Your landing page doesn't connect to anything.",
      desc: "Leads fill out forms that go nowhere.",
    },
  ] as const;

  return (
    <section className="web-section">
      <div className="web-container rounded-2xl bg-[hsl(var(--color-surface-raised))/0.25] p-6 md:p-10">
        <p className="section-label text-center">The Problem</p>
        <h2 className="mx-auto max-w-[760px] text-center text-[32px] font-semibold tracking-[-0.02em]">
          You're paying $300/month for tools that don't talk to each other.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((card, index) => (
            <article key={card.title} className="glass-card rounded-2xl p-5" style={{ animationDelay: `${index * 80}ms` }}>
              <div className="mb-3 inline-flex rounded-lg border border-primary/30 p-2 text-primary">
                <card.icon className="h-5 w-5" />
              </div>
              <p className="text-[18px] font-semibold leading-tight text-foreground">{card.title}</p>
              <p className="mt-2 text-sm text-[hsl(var(--color-text-secondary))]">{card.desc}</p>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-[hsl(var(--color-text-secondary))]">
          SeldonFrame replaces them all. One system. Everything connected. Free to start, $29/mo when you scale.
        </p>
      </div>
    </section>
  );
}
