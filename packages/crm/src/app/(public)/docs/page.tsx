import Link from "next/link";

const sections = [
  {
    id: "what-is-seldonframe",
    title: "What is SeldonFrame?",
    body: [
      "SeldonFrame is your business operating system. One soul powers every block so your CRM, booking, email, pages, forms, and automations stay in sync.",
      "Instead of stitching disconnected tools, you run one connected system that reflects how your business actually works.",
      "When your business changes, you update your soul once and every block follows.",
    ],
  },
  {
    id: "what-is-a-soul",
    title: "What is a Soul?",
    body: [
      "Your soul is a single source of truth for your business identity: who you serve, how you speak, what you offer, and your client journey.",
      "Every block reads from this context to stay consistent across messaging, workflow, and defaults.",
      "When you update your soul, your system updates with it.",
    ],
  },
  {
    id: "what-are-blocks",
    title: "What are Blocks?",
    body: [
      "Blocks are the building units of your business system: CRM, Booking, Email, Pages, Forms, and Automations.",
      "Each block works on its own, but the real value is how they connect through your soul.",
      "A lead from a form can become a CRM contact, trigger an email sequence, and route to a booking flow automatically.",
    ],
  },
  {
    id: "what-are-frameworks",
    title: "What are Frameworks?",
    body: [
      "Frameworks are pre-built business setups for specific models like Coaching, Agency, or SaaS.",
      "Each framework configures your soul, pipeline, templates, and automation defaults in one launch.",
      "You can start from a framework, then customize anything with Seldon It.",
    ],
  },
  {
    id: "what-is-seldon-it",
    title: "What is Seldon It?",
    body: [
      "Seldon It lets you describe what you need in plain English, then generates connected resources as portable BLOCK.md packages.",
      "It can create full connected flows (for example form → CRM → email → booking) from one prompt.",
      "If a feature does not exist yet, you can Seldon it into existence.",
    ],
  },
  {
    id: "for-pro-users",
    title: "For Pro Users",
    body: [
      "Pro is built for agencies and operators managing multiple client workspaces.",
      "You can run many businesses from one dashboard, ship niche frameworks, and keep each workspace isolated.",
      "Pro also unlocks custom domains and white-label controls for client-facing experiences.",
    ],
  },
  {
    id: "self-hosting",
    title: "Self-Hosting",
    body: [
      "SeldonFrame is open source under MIT, so you can clone, host, and control your own stack.",
      "Bring your own Postgres, deploy on your preferred infrastructure, and keep ownership of your data.",
      "Cloud is available for speed, but self-host remains a first-class option.",
    ],
  },
  {
    id: "api-integrations",
    title: "API & Integrations",
    body: [
      "SeldonFrame integrates with tools like Stripe, Kit, Mailchimp, Beehiiv, Twilio, and Google Calendar.",
      "Integrations connect directly to blocks so your workflows trigger from real events instead of manual sync work.",
      "Additional integrations and MCP-powered extensions are on the roadmap.",
    ],
  },
] as const;

export default function DocsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <aside className="sticky top-20 hidden h-fit w-64 shrink-0 rounded-xl border border-border bg-card p-4 lg:block">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">On this page</p>
        <nav className="mt-3 space-y-2">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="block text-sm text-muted-foreground hover:text-foreground">
              {section.title}
            </a>
          ))}
        </nav>
        <Link href="/" className="mt-4 inline-flex text-xs text-primary underline underline-offset-4">
          Back to home
        </Link>
      </aside>

      <section className="min-w-0 flex-1 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Getting Started with SeldonFrame</h1>
          <p className="text-sm text-muted-foreground">
            Concept-first guidance for understanding how SeldonFrame is structured and how the system pieces work together.
          </p>
        </header>

        {sections.map((section) => (
          <article key={section.id} id={section.id} className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
