import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAgencyProfile } from "@/lib/agency-profile/actions";
import { AgencyProfileForm } from "./agency-profile-form";
import { AGENCY_PROFILE_COPY as C } from "./copy";

export default async function AgencyProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const profile = (await getAgencyProfile()) ?? {};

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">{C.pageHeading}</h1>
        <p className="text-sm sm:text-base text-muted-foreground">{C.pageSubheading}</p>
      </div>

      <article className="rounded-xl border bg-card p-5">
        <AgencyProfileForm initial={profile} />
      </article>
    </section>
  );
}
