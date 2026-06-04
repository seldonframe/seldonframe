// packages/crm/src/app/(dashboard)/onboarding/[id]/page.tsx
//
// 2026-06-04 — Onboarding T14. Agency review-and-apply screen.
// Shows the change plan's summaries grouped into friendly sections
// and a single "Apply all" button. After apply the page re-renders
// in an "Applied" state (via revalidatePath in the action).

import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { changePlans } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import type { ChangePlan as ChangePlanPayload } from "@/lib/onboarding/change-plan";
import { applyChangePlanAction } from "./apply-action";

export const dynamic = "force-dynamic";

// ── section grouping ────────────────────────────────────────────────────────────
//
// Each summary line starts with a prefix like "Website:", "Booking:", etc.
// We bucket them into friendly section headings for display.

type Section = {
  heading: string;
  lines: string[];
};

const SECTION_PREFIXES: { prefix: string; heading: string }[] = [
  { prefix: "Website", heading: "Website" },
  { prefix: "Booking", heading: "Booking" },
  { prefix: "Services", heading: "Services" },
  { prefix: "Theme", heading: "Brand" },
  { prefix: "Call handling", heading: "Chatbot & Phones" },
  { prefix: "Domain", heading: "Domain & Phones" },
  { prefix: "CRM", heading: "Contacts" },
  { prefix: "Bookings", heading: "Bookings Import" },
  { prefix: "Workspace", heading: "Workspace" },
];

function groupSummaries(summaries: string[]): Section[] {
  const buckets = new Map<string, string[]>();

  for (const line of summaries) {
    let heading = "Other";
    for (const { prefix, heading: h } of SECTION_PREFIXES) {
      if (line.startsWith(prefix)) {
        heading = h;
        break;
      }
    }
    const existing = buckets.get(heading) ?? [];
    existing.push(line);
    buckets.set(heading, existing);
  }

  return Array.from(buckets.entries()).map(([heading, lines]) => ({
    heading,
    lines,
  }));
}

// ── page ────────────────────────────────────────────────────────────────────────

export default async function OnboardingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const orgId = await getOrgId();
  if (!orgId) redirect("/login");

  const { id } = await params;

  const [row] = await db
    .select()
    .from(changePlans)
    .where(and(eq(changePlans.id, id), eq(changePlans.orgId, orgId)))
    .limit(1);

  if (!row) notFound();

  const plan = row.plan as ChangePlanPayload;
  const businessName =
    typeof plan.soul?.["business_name"] === "string"
      ? plan.soul["business_name"]
      : typeof plan.soul?.["businessName"] === "string"
        ? plan.soul["businessName"]
        : "this client";

  const sections = groupSummaries(plan.summaries ?? []);
  const isApplied = row.status === "applied";

  // Bind the action to this plan id so the form needs no hidden input.
  // The form action type requires (FormData) => void | Promise<void>, so
  // we wrap the bound action to discard the return value.
  const boundApply = applyChangePlanAction.bind(null, id);
  async function applyAction(_formData: FormData): Promise<void> {
    "use server";
    await boundApply();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      {/* ── header ── */}
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          Review {businessName}&apos;s setup
        </h1>
        <p className="text-sm text-muted-foreground">
          {isApplied
            ? "This change plan has been applied to the workspace."
            : "Confirm the changes below then click Apply all to wire them into the workspace."}
        </p>
      </header>

      {/* ── summaries ── */}
      {sections.length > 0 ? (
        <div className="space-y-6">
          {sections.map((section) => (
            <section
              key={section.heading}
              className="rounded-2xl border bg-card/40 p-5 space-y-3"
            >
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {section.heading}
              </h2>
              <ul className="space-y-2">
                {section.lines.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 flex-shrink-0 h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                      {isApplied ? "✓" : "·"}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-card/40 p-5 text-sm text-muted-foreground">
          No changes recorded in this plan.
        </div>
      )}

      {/* ── action ── */}
      <div className="pt-2">
        {isApplied ? (
          <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-5 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <span>Applied ✓</span>
            {row.appliedAt && (
              <span className="text-xs opacity-70">
                {new Date(row.appliedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        ) : (
          <form action={applyAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              Apply all
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
