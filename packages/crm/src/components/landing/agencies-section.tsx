import Link from "next/link";

export function LandingAgenciesSection() {
  return (
    <section className="mx-auto max-w-3xl border-t border-zinc-800/30 px-6 py-16 text-center md:py-20">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">For Agencies</p>
      <h2 className="text-3xl font-bold text-zinc-100">Set up 10 client businesses in one afternoon.</h2>
      <p className="mx-auto mt-4 max-w-xl leading-relaxed text-zinc-400">
        Paste your client&apos;s website URL. SeldonFrame reads it, creates their soul, and builds their booking page,
        intake form, and email sequences.
      </p>
      <div className="mt-8 grid grid-cols-3 gap-3">
        <div>
          <div className="text-2xl font-bold text-zinc-100">10 min</div>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">per client</p>
        </div>
        <div>
          <div className="text-2xl font-bold text-zinc-100">$349/mo</div>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">10 workspaces</p>
        </div>
        <div>
          <div className="text-2xl font-bold text-zinc-100">$10K/mo</div>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">rev potential</p>
        </div>
      </div>
      <Link href="/pricing" className="mt-8 inline-block text-sm font-semibold text-[#14b8a6] transition-opacity hover:opacity-80">
        See Pro plans →
      </Link>
    </section>
  );
}
