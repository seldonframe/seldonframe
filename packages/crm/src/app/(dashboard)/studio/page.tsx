import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

export default async function CreatorStudioPage() {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const listings = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      niche: marketplaceListings.niche,
      price: marketplaceListings.price,
      previewImageUrl: marketplaceListings.previewImageUrl,
      installCount: marketplaceListings.installCount,
      rating: marketplaceListings.rating,
      reviewCount: marketplaceListings.reviewCount,
      isPublished: marketplaceListings.isPublished,
      updatedAt: marketplaceListings.updatedAt,
    })
    .from(marketplaceListings)
    .where(eq(marketplaceListings.creatorOrgId, orgId))
    .orderBy(desc(marketplaceListings.updatedAt));

  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Creator Studio</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Build souls, publish to the marketplace, and keep 100% of every sale.
          </p>
        </div>
        <Link href="/studio/new" className="crm-button-primary h-10 px-4">
          Create New Soul
        </Link>
      </div>

      <article className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-card-title">Your Published Souls</h2>

        {listings.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No souls yet. Create one in a few minutes and publish it to the marketplace.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {listing.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={listing.previewImageUrl} alt={listing.name} className="h-14 w-14 rounded-md object-cover border" />
                  ) : (
                    <div className="h-14 w-14 rounded-md border bg-muted/40" />
                  )}

                  <div>
                    <p className="text-sm font-medium text-foreground">{listing.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {listing.niche} · {listing.price === 0 ? "Free" : `$${(listing.price / 100).toFixed(0)}`} · {listing.isPublished ? "Published" : "Draft"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(listing.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{listing.installCount} installs</span>
                  <span>
                    {Number(listing.rating ?? 0).toFixed(1)} ★{listing.reviewCount > 0 ? ` (${listing.reviewCount})` : ""}
                  </span>
                  <Link href={`/soul-marketplace/${listing.slug}`} className="crm-button-secondary h-8 px-3">
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
