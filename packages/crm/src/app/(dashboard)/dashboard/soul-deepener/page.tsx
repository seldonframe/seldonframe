import { redirect } from "next/navigation";
import { SoulDeepener } from "@/components/onboarding/soul-deepener";
import { getSoul } from "@/lib/soul/server";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/content.tsx
    - page content shell: "flex-1 overflow-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-background w-full"
*/

export default async function SoulDeepenerPage() {
  const soul = await getSoul();

  if (!soul) {
    redirect("/setup");
  }

  if (soul.deepSetup?.completedAt) {
    redirect("/dashboard");
  }

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-background w-full">
      <SoulDeepener existingResponses={soul.deepSetup?.responses ?? []} />
    </main>
  );
}
