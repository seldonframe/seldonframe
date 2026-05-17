// 2026-05-17 — Skeleton for /bookings. The listing pulls labels +
// appointment types + bookings + contacts + soul + integrations + org
// row in parallel, so first paint can take a beat. Render a placeholder
// matching the live page's header + appointment-types card + calendar
// frame so the layout doesn't jump when data arrives.

import { Skeleton } from "@/components/ui/skeleton";

export default function BookingsLoading() {
  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6" aria-busy>
      <div className="border-b border-border bg-background px-3 sm:px-6 py-3 sm:py-4 space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>

      <div className="space-y-4 px-3 sm:px-6">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Skeleton className="h-8 w-16 rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
          <Skeleton className="h-[520px] w-full rounded-b-xl" />
        </div>
      </div>
    </section>
  );
}
