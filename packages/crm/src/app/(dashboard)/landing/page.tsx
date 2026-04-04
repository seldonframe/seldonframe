import { createLandingPageAction, listLandingPages } from "@/lib/landing/actions";
import { getLabels } from "@/lib/soul/labels";
import { LandingPagesContent } from "@/components/landing/landing-pages-content";
import { getOrgId } from "@/lib/auth/helpers";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/content.tsx
    - content shell: "flex-1 overflow-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-background w-full"
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - subtitle: "text-sm sm:text-base text-muted-foreground"
*/

export default async function LandingPagesDashboard() {
  const [labels, pages, orgId] = await Promise.all([getLabels(), listLandingPages(), getOrgId()]);
  const [org] = orgId ? await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1) : [null];
  const orgSlug = org?.slug ?? "";

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Pages</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Build and publish modular pages with integrated {labels.intakeForm.singular.toLowerCase()} and booking sections.
        </p>
      </div>

      <LandingPagesContent
        pages={pages.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status,
          updatedAt: p.updatedAt.toISOString(),
        }))}
        orgSlug={orgSlug}
        createAction={createLandingPageAction}
      />
    </section>
  );
}
