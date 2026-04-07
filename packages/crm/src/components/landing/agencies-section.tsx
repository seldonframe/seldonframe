import Link from "next/link";

export function LandingAgenciesSection() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">For Agencies</span>
      <h2 className="mt-4 text-3xl font-bold text-zinc-100">Set up 10 client businesses in one afternoon.</h2>
      <p className="mt-6 leading-relaxed text-zinc-400">
        Paste your client&apos;s website URL. SeldonFrame reads it, creates their soul, and builds their booking page,
        intake form, and email sequences. Each client gets their own workspace.
      </p>
      <div className="mt-12 grid grid-cols-3 gap-4">
        <div>
          <div className="text-2xl font-bold text-zinc-100">10 min</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">to set up each client</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-zinc-100">$349/mo</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">up to 10 workspaces</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-zinc-100">$5K-$10K/mo</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">what you can charge</div>
        </div>
      </div>
      <Link href="/pricing" className="mt-10 inline-block text-sm font-semibold text-[#14b8a6] transition-opacity hover:opacity-80">
        See Pro plans →
      </Link>
    </section>
  );
}
