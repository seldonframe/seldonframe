// 2026-05-17 — Skeleton for /settings (and its sub-pages by default).
// The hub page reads ~10 things in parallel (subscription, theme,
// branding, portal gate, integrations, etc.) so render a placeholder
// instead of letting the layout flash empty cards.

import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <section className="animate-page-enter space-y-6 sm:space-y-8" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>

      {Array.from({ length: 3 }).map((_, groupIdx) => (
        <article key={groupIdx} className="rounded-xl border bg-card p-5 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, cardIdx) => (
              <div key={cardIdx} className="rounded-lg border border-zinc-800 p-5 space-y-3">
                <Skeleton className="h-4 w-28" />
                <SkeletonLines lines={2} />
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
