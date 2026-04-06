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
  const soul = await getSoul();

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Business Profile</h1>
      </div>
      <BusinessProfileForm
        initialBusinessName={soul?.businessName ?? ""}
        initialIndustry={soul?.industry ?? ""}
        initialBusinessDescription={soul?.businessDescription ?? ""}
        initialOfferType={soul?.offerType ?? "services"}
        initialCustomContext={soul?.customContext ?? ""}
      />
    </section>
  );
}
