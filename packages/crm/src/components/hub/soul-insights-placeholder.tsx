export function SoulInsightsPlaceholder() {
  return (
    <section className="crm-card space-y-3">
      <div>
        <h2 className="text-card-title">Soul Insights</h2>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Placeholder for upcoming strategic intelligence across all product blocks.</p>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <article className="rounded-lg border border-border bg-[hsl(var(--muted)/0.35)] p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Block Health</p>
          <p className="mt-1 text-lg font-semibold">Pending</p>
        </article>
        <article className="rounded-lg border border-border bg-[hsl(var(--muted)/0.35)] p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Adoption Trend</p>
          <p className="mt-1 text-lg font-semibold">Pending</p>
        </article>
        <article className="rounded-lg border border-border bg-[hsl(var(--muted)/0.35)] p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Optimization</p>
          <p className="mt-1 text-lg font-semibold">Pending</p>
        </article>
      </div>
    </section>
  );
}
