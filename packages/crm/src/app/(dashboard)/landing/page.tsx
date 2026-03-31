import { createLandingPageAction, listLandingPages } from "@/lib/landing/actions";
import { getLabels } from "@/lib/soul/labels";
import { LandingPagesContent } from "@/components/landing/landing-pages-content";
import { getOrgId } from "@/lib/auth/helpers";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function LandingPagesDashboard() {
  const [labels, pages, orgId] = await Promise.all([getLabels(), listLandingPages(), getOrgId()]);
  const [org] = orgId ? await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1) : [null];
  const orgSlug = org?.slug ?? "";

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Pages</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
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
