import Link from "next/link";
import { ExternalLink } from "lucide-react";

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <span className="text-lg font-semibold tracking-tight text-zinc-100">SeldonFrame</span>
        <div className="flex items-center gap-6 text-sm font-medium text-zinc-500">
          <Link href="/pricing" className="transition-colors hover:text-zinc-200">
            Pricing
          </Link>
          <Link
            href="https://github.com/seldonframe/crm"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 transition-colors hover:text-zinc-200"
          >
            GitHub <ExternalLink size={12} />
          </Link>
          <Link href="/sign-in" className="transition-colors hover:text-zinc-200">
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}
