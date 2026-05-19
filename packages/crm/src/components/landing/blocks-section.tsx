type Block = {
  name: string;
  desc: string;
  image?: string;
  alt?: string;
};

const BLOCKS: readonly Block[] = [
  {
    name: "CRM",
    desc: "See every lead and client in one place",
    image: "/marketing/crm-pipeline.png",
    alt: "CRM + pipeline view — contacts, deals, activity timeline all in one place.",
  },
  {
    name: "Booking",
    desc: "Let people book you. Syncs with your calendar.",
    image: "/marketing/booking-page.png",
    alt: "Public booking page — customer picks a slot, lands on the operator's calendar.",
  },
  {
    name: "Forms",
    desc: "Intake forms, quizzes, applications",
    image: "/marketing/form.png",
    alt: "Intake form — operator-branded, fields auto-derived from the workspace's vertical.",
  },
  {
    name: "Agents",
    desc: "AI receptionist + automations that close the loop",
    image: "/marketing/agents.png",
    alt: "Operator dashboard — automations tab showing speed-to-lead and other agents in flight.",
  },
  { name: "Pages", desc: "Landing pages, sales pages, result pages" },
  { name: "Email", desc: "Welcome emails, follow-ups, reminders" },
];

export function LandingBlocksSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
      <div className="text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Blocks</span>
        <h2 className="mt-4 text-3xl font-bold text-zinc-100">Everything your business needs. All in one place.</h2>
        <p className="mt-4 text-zinc-400">Each block talks to every other block. No copy-paste. No broken automations.</p>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BLOCKS.map((block) => (
          <div
            key={block.name}
            className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700"
          >
            {block.image ? (
              <div className="overflow-hidden border-b border-zinc-800/60 bg-zinc-950/40">
                <img
                  src={block.image}
                  alt={block.alt ?? block.name}
                  className="aspect-[16/10] w-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : null}
            <div className="p-6">
              <h3 className="text-base font-semibold text-zinc-200">{block.name}</h3>
              <p className="mt-2 text-sm text-zinc-500">{block.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-12 text-center text-sm leading-relaxed text-zinc-500">
        Someone fills your form → they show up in your CRM → they get an email → they book a call → it&apos;s on your
        calendar. <br className="hidden md:block" />Automatically.
      </p>
    </section>
  );
}
