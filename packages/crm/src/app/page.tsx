import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPlan } from "@/lib/billing/plans";

export default async function RootPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  if (!session.user?.soulCompleted) {
    redirect("/setup");
  }

  const plan = getPlan(session.user.planId ?? "");

  if (plan?.type === "pro") {
    redirect("/orgs");
  }

  redirect("/dashboard");
}
