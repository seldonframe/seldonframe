// Cut C Phase 5 — GitHub stars badge.
//
// Server-rendered count with 1-hour revalidate. We do NOT fetch on the
// client because (a) every visitor would hit GitHub's unauthenticated
// API and burn the 60-req/hour shared rate limit per IP and (b) the
// loading spinner would visibly flash on every cold render. The
// server-cached path costs one fetch per hour per Vercel region.
//
// fetchStarCount returns null on any error (network, 4xx, 5xx, JSON
// parse fail). The badge renders gracefully without a count — the
// link itself is the value, the count is a nice-to-have proof.
//
// Repo path: seldonframe/crm (verified May 2026 against nav.tsx and
// LICENSE — the public mirror's name is `crm`, not the older
// `seldonframe/seldonframe` placeholder some early docs used).

import Link from "next/link";
import { Star, GitFork } from "lucide-react";
// Note: lucide-react@1.7 doesn't export a Github icon — GitFork is the
// closest semantic match for "open source repo on GitHub" and aligns
// with the section H2 ("If we ever get weird about pricing, fork us.")

function formatStars(stars: number): string {
  if (stars >= 1000) {
    const k = stars / 1000;
    // 1.0k–99.9k → one decimal ("1.2k", "12.4k"); 100k+ → integer
    // ("134k") to keep the badge from getting wider than the
    // "seldonframe/crm" slug it sits next to.
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return String(stars);
}

export function GitHubStarsBadge({ stars }: { stars: number | null }) {
  return (
    <Link
      href="https://github.com/seldonframe/crm"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={
        stars !== null
          ? `Star seldonframe/crm on GitHub — ${stars} stars`
          : "View seldonframe/crm on GitHub"
      }
      // design-critique May 2026: demoted from CTA-styled button to
      // chip — transparent surface, thin border. Reads as proof of
      // existence, not a primary action. Vertical padding bumped to
      // py-2.5 so the click target clears WCAG 2.5.5 (>=44px).
      className="inline-flex items-center gap-2 rounded-full border border-zinc-700/60 bg-transparent px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#059669]"
    >
      <GitFork size={16} aria-hidden="true" />
      <span>seldonframe/crm</span>
      {stars !== null ? (
        <span
          className="flex items-center gap-1 text-zinc-400"
          aria-hidden="true"
        >
          <Star size={12} className="text-[#059669]" />
          {formatStars(stars)}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Server-side fetch with 1-hour revalidate cache. Wrap call sites in
 * an async server component. Returns null on any error so the badge
 * can render gracefully without a count.
 */
export async function fetchStarCount(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/seldonframe/crm", {
      next: { revalidate: 3600 }, // 1 hour
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}
