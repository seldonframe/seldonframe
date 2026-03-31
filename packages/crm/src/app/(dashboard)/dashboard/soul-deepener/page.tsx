import { redirect } from "next/navigation";
import { SoulDeepener } from "@/components/onboarding/soul-deepener";
import { getSoul } from "@/lib/soul/server";

export default async function SoulDeepenerPage() {
  const soul = await getSoul();

  if (!soul) {
    redirect("/setup");
  }

  if (soul.deepSetup?.completedAt) {
    redirect("/dashboard");
  }

  return (
    <main className="crm-page animate-page-enter px-4 py-6 md:px-8">
      <SoulDeepener existingResponses={soul.deepSetup?.responses ?? []} />
    </main>
  );
}
