export function LandingMarketplaceSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
      <div className="text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Marketplace</span>
        <h2 className="mt-4 text-3xl font-bold text-zinc-100">Don&apos;t start from zero.</h2>
        <p className="mt-4 text-zinc-400">
          Find a framework built for your exact type of business. Install it in one click.
        </p>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {[
          { name: "Life Coach Framework", price: "Free" },
          { name: "Yoga Studio Framework", price: "$47" },
          { name: "Real Estate Agent", price: "$97" },
          { name: "Therapy Practice", price: "$67" },
        ].map((soul) => (
          <div
            key={soul.name}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
          >
            <div className="text-sm font-semibold text-zinc-200">{soul.name}</div>
            <div className="text-xs font-bold text-[#14b8a6]">{soul.price}</div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-zinc-600">Creators keep 100% of sales. We take 0%.</p>
    </section>
  );
}
