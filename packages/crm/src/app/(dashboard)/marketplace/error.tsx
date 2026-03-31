"use client";

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="animate-page-enter space-y-4">
      <article className="glass-card rounded-2xl p-6">
        <h1 className="text-page-title">Marketplace unavailable</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          We couldn&apos;t load marketplace data right now. Please try again.
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{error.message}</p>
        <button type="button" onClick={reset} className="crm-button-primary mt-4 h-10 px-5">
          Retry
        </button>
      </article>
    </section>
  );
}
