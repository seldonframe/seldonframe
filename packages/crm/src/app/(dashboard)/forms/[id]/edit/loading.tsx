// 2026-05-17 — Skeleton for the form-edit page. Renders while the
// form's DB row is being fetched so navigating to /forms/<id>/edit
// after creation never lands on a blank screen.

import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function FormEditLoading() {
  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <Skeleton className="h-4 w-32" />
        <SkeletonLines lines={2} />
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[1fr_2fr_auto]">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}
