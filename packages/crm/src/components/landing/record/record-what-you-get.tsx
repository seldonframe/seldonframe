// packages/crm/src/components/landing/record/record-what-you-get.tsx
//
// The one-product bridge for record mode (spec §4.3): a recording
// doesn't build a lesser thing — it builds the same SeldonFrame
// workspace, entered sideways. Server component.

const CARDS = [
  {
    title: "A compiled agent",
    body: "Every step traced from your recording, with coverage you can see — green, yellow, red — before you trust it.",
  },
  {
    title: "Grounded, not improvised",
    body: "The agent runs your workflow the way you showed it. When it doesn't know, it asks — it doesn't guess.",
  },
  {
    title: "A full workspace around it",
    body: "CRM, booking, intake, and a portal come with it. The agent has somewhere to work from day one.",
  },
  {
    title: "Yours, flat price",
    body: "Recording and compiling are free with no signup. $29/mo when you switch it on. Cancel anytime.",
  },
] as const;

export function RecordWhatYouGet() {
  return (
    <section aria-label="What you get" className="px-5 py-16 md:px-8 md:py-20">
      <div className="mx-auto w-full max-w-[1000px]">
        <p className="inline-flex items-center gap-2.5 font-sans text-[13.5px] tracking-[0.04em] text-[var(--lp-muted)]">
          <span className="inline-block size-1.5 rounded-full bg-[var(--lp-accent)]" aria-hidden />
          From screenshare to deployed agent
        </p>
        <h2 className="mt-3 max-w-[24ch] text-balance font-sans text-[clamp(26px,3.2vw,38px)] font-[500] leading-[1.1] tracking-[-0.02em] text-[var(--lp-ink)]">
          The same SeldonFrame, entered sideways
        </h2>
        <p className="mt-4 max-w-[62ch] text-pretty text-[16px] leading-[1.55] text-[var(--lp-body)]">
          A recording doesn&apos;t build a toy. It builds the same agent + workspace the
          front-door path builds — just trained on how you actually work.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {CARDS.map((c) => (
            <div
              key={c.title}
              className="rounded-[14px] border border-[var(--lp-border-soft)] bg-[var(--lp-card)] p-5"
            >
              <h3 className="text-[17px] font-[600] leading-[1.3] text-[var(--lp-ink)]">{c.title}</h3>
              <p className="mt-2 text-[16px] leading-[1.55] text-[var(--lp-body)]">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
