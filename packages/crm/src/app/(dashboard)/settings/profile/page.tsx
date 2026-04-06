import { getSoul } from "@/lib/soul/server";
import { CustomContextForm } from "./custom-context-form";

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
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm text-foreground">Business: {soul?.businessName ?? "Not set"}</p>
        <p className="text-sm text-foreground">Industry: {soul?.industry ?? "Not set"}</p>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground">Edit via Soul setup to regenerate labels, voice, and pipeline defaults.</p>
      </div>
      <CustomContextForm initialValue={soul?.customContext ?? ""} />
    </section>
  );
}
