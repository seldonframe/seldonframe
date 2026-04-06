import { and, eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { marketplaceListings, organizations } from "@/db/schema";
import { finalizeSoulListingPurchaseReturnAction, purchaseSoulListingAction } from "@/lib/marketplace/actions";

type SoulInstallPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ purchased?: string }>;
};

export default async function SoulInstallPage({ params, searchParams }: SoulInstallPageProps) {
  const { slug } = await params;
  const { purchased } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [listing] = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      description: marketplaceListings.description,
      price: marketplaceListings.price,
      isPublished: marketplaceListings.isPublished,
    })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!listing || !listing.isPublished) {
    notFound();
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, session.user.orgId))
    .limit(1);

  const installedListingIds = readInstalledListingIds(org?.settings as Record<string, unknown> | null | undefined);
  const isInstalled = installedListingIds.includes(listing.id);

  if (purchased === "true") {
    const formData = new FormData();
    formData.set("slug", slug);
    await finalizeSoulListingPurchaseReturnAction(formData);
    redirect("/dashboard");
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <article className="rounded-xl border bg-card p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Install Soul</h1>
          <p className="mt-1 text-sm text-muted-foreground">{listing.name}</p>
        </div>

        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm text-muted-foreground">{listing.description || "No description provided."}</p>
          <p className="text-base font-medium text-foreground">{listing.price === 0 ? "Free" : `$${(listing.price / 100).toFixed(0)}`}</p>
        </div>

        {isInstalled ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This soul is already installed for your active workspace.</p>
            <a href="/dashboard" className="crm-button-secondary h-10 px-6 inline-flex items-center">
              Open Dashboard
            </a>
          </div>
        ) : (
          <form
            action={async (formData) => {
              "use server";
              const result = await purchaseSoulListingAction(formData);
              if (result.checkoutUrl) {
                redirect(result.checkoutUrl);
              }
              redirect("/dashboard");
            }}
            className="space-y-3"
          >
            <input type="hidden" name="slug" value={slug} />
            <button type="submit" className="crm-button-primary h-10 px-6">
              {listing.price === 0 ? "Install Free" : `Buy & Install · $${(listing.price / 100).toFixed(0)}`}
            </button>
            <p className="text-xs text-muted-foreground">By continuing you agree to install this soul package to your active organization.</p>
          </form>
        )}
      </article>
    </section>
  );
}

function readInstalledListingIds(settings: Record<string, unknown> | null | undefined) {
  const value = settings?.marketplaceInstalledListingIds;
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.map((item) => String(item)).filter(Boolean);
}
