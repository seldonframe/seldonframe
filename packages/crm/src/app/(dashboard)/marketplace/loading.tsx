export default function MarketplaceLoading() {
  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Block Marketplace</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Loading marketplace blocks...</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <article key={idx} className="glass-card rounded-2xl p-5">
            <div className="h-5 w-2/3 animate-pulse rounded bg-[hsl(var(--muted)/0.55)]" />
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-[hsl(var(--muted)/0.4)]" />
            <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-[hsl(var(--muted)/0.35)]" />
            <div className="mt-4 h-9 w-24 animate-pulse rounded bg-[hsl(var(--muted)/0.5)]" />
          </article>
        ))}
      </div>
    </section>
  );
}
