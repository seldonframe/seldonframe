import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getSoul } from "@/lib/soul/server";
import { BusinessProfileForm } from "./business-profile-form";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper text: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

export default async function SettingsProfilePage() {
  // 2026-05-17 — fall back to the workspace's name when soul is null
  // (agency-primary orgs created at signup never had a soul, so the
  // form was rendering empty + the save action used to throw). The
  // soul/actions.ts auto-creates a soul on first save now; this just
  // makes the field show a sensible starting value.
  const [soul, orgId] = await Promise.all([getSoul(), getOrgId()]);
  const [orgRow] = orgId
    ? await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
    : [null];

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Business Profile</h1>
      </div>
      <BusinessProfileForm
        initialBusinessName={soul?.businessName || orgRow?.name || ""}
        initialIndustry={soul?.industry ?? ""}
        initialBusinessDescription={soul?.businessDescription ?? ""}
        initialOfferType={soul?.offerType ?? "services"}
        initialCustomContext={soul?.customContext ?? ""}
      />
    </section>
  );
}
