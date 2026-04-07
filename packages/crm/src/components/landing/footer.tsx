import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-zinc-800/30 py-12">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="text-sm font-semibold text-zinc-100">SeldonFrame</span>
            <p className="mt-4 text-xs leading-relaxed text-zinc-700">
              © 2026 SeldonFrame. <br />Open source under MIT license.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Product</span>
            {["Features", "Pricing", "Marketplace", "Docs"].map((link) => (
              <a key={link} href="#" className="text-xs text-zinc-600 transition-colors hover:text-zinc-400">
                {link}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Community</span>
            {["GitHub", "Discord", "Twitter"].map((link) => (
              <a key={link} href="#" className="text-xs text-zinc-600 transition-colors hover:text-zinc-400">
                {link}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Legal</span>
            <Link
              href="https://app.seldonframe.com/policy"
              className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              Privacy
            </Link>
            <Link
              href="https://app.seldonframe.com/terms"
              className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
