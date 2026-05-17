// 2026-05-17 — Skeleton for the /forms list page. Suspense boundary
// renders this while the listForms() server query is in flight, so the
// page never flashes "no forms" before populating. Matches the same
// shape the live page uses (title row + 4-stat grid + listing card).

import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function FormsLoading() {
  return (
    <section className="animate-page-enter space-y-6" aria-busy>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-9 w-44 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-7 w-12" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        <SkeletonLines lines={3} />
      </div>
    </section>
  );
}
