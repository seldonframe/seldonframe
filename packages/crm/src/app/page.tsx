import Image from "next/image";

export default function Home() {
  return (
    <main className="crm-page flex flex-1 items-center justify-center">
      <section className="crm-card w-full max-w-4xl p-(--space-page)">
        <div className="mb-(--space-section) flex items-center justify-between gap-4">
          <div>
            <Image src="/logo-full.svg" alt="SeldonFrame" width={194} height={36} className="h-9 w-auto" priority />
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Open Source CRM Framework
            </h1>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs font-semibold text-[hsl(var(--color-text-secondary))]">
            Step 1 Scaffold Ready
          </span>
        </div>

        <p className="max-w-2xl text-[hsl(var(--color-text-secondary))]">
          This project is scaffolded with Next.js App Router, Tailwind CSS, and a
          custom design-token layer for Soul-driven branding, component overrides,
          and premium dashboard polish.
        </p>

        <div className="mt-(--space-section) grid gap-4 sm:grid-cols-3">
          {[
            "Design tokens wired",
            "Theme constants exported",
            "Component overrides in place",
          ].map((item) => (
            <article key={item} className="crm-card p-(--space-card)">
              <p className="text-sm font-medium">{item}</p>
            </article>
          ))}
        </div>

        <div className="mt-(--space-section) flex flex-wrap gap-3">
          <button type="button" className="crm-button-primary h-10 px-4">
            Continue to database setup
          </button>
          <a
            href="https://nextjs.org/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-[hsl(var(--color-surface-raised))]"
          >
            Next.js docs
          </a>
        </div>
      </section>
    </main>
  );
}
