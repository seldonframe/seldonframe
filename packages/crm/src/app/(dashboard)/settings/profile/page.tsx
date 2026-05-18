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

  // 2026-05-18 — the lean URL flow writes the soul with snake_case keys
  // (business_name / soul_description / services) via buildSeedSoul in
  // lib/billing/anonymous-workspace.ts, while the OrgSoul TS type uses
  // camelCase (businessName / businessDescription / industry). Result:
  // /settings/profile showed empty placeholders for every workspace
  // created via create_workspace_from_url. Read BOTH shapes here so
  // either casing populates the form. Industry isn't seeded by the
  // URL flow at all, so we derive it from soul.industry OR
  // settings.crmPersonality (the personality classifier sets a
  // `personality.industry` hint at create time, e.g. "Roofing").
  const soulLoose = (soul ?? {}) as Record<string, unknown>;
  const businessName =
    (typeof soul?.businessName === "string" && soul.businessName) ||
    (typeof soulLoose.business_name === "string" && (soulLoose.business_name as string)) ||
    orgRow?.name ||
    "";
  const businessDescription =
    (typeof soul?.businessDescription === "string" && soul.businessDescription) ||
    (typeof soulLoose.soul_description === "string" && (soulLoose.soul_description as string)) ||
    (typeof soulLoose.business_description === "string" && (soulLoose.business_description as string)) ||
    "";
  const industry =
    (typeof soul?.industry === "string" && soul.industry) ||
    (typeof soulLoose.industry === "string" && (soulLoose.industry as string)) ||
    "";

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Business Profile</h1>
      </div>
      <BusinessProfileForm
        initialBusinessName={businessName}
        initialIndustry={industry}
        initialBusinessDescription={businessDescription}
        initialOfferType={soul?.offerType ?? "services"}
        initialCustomContext={soul?.customContext ?? ""}
      />
    </section>
  );
}
