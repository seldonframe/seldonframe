import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SoulWizard } from "@/components/soul/soul-wizard";

export default async function SetupPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="crm-page animate-page-enter flex items-center justify-center">
      <SoulWizard />
    </main>
  );
}
