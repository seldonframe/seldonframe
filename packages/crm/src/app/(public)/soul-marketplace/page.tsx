import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";

type MarketplacePageProps = {
  searchParams: Promise<{ niche?: string; q?: string }>;
};

const ALL_NICHES = [
  "all",
  "coaching",
  "agency",
  "therapy",
  "fitness",
  "real-estate",
  "saas",
  "education",
  "other",
] as const;

export default async function SoulMarketplacePage({ searchParams }: MarketplacePageProps) {
  const params = await searchParams;
  const niche = String(params.niche ?? "all").trim().toLowerCase();
  const query = String(params.q ?? "").trim().toLowerCase();

  const listings = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      description: marketplaceListings.description,
      niche: marketplaceListings.niche,
      price: marketplaceListings.price,
      previewImageUrl: marketplaceListings.previewImageUrl,
      installCount: marketplaceListings.installCount,
      rating: marketplaceListings.rating,
      reviewCount: marketplaceListings.reviewCount,
    })
    .from(marketplaceListings)
    .where(eq(marketplaceListings.isPublished, true))
    .orderBy(desc(marketplaceListings.installCount), desc(marketplaceListings.createdAt));

  const filtered = listings.filter((listing) => {
    const nicheMatch = niche === "all" || listing.niche === niche;

    if (!nicheMatch) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [listing.name, listing.description ?? "", listing.niche].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold text-foreground">Soul Marketplace</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Install a soul and get a fully configured business in under a minute.</p>
      </div>

      <form className="rounded-xl border bg-card p-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search souls..."
          className="crm-input h-10 w-full px-3"
        />
        <select name="niche" defaultValue={ALL_NICHES.includes(niche as (typeof ALL_NICHES)[number]) ? niche : "all"} className="crm-input h-10 w-full px-3">
          <option value="all">All niches</option>
          <option value="coaching">Coaching</option>
          <option value="agency">Agency</option>
          <option value="therapy">Therapy</option>
          <option value="fitness">Fitness</option>
          <option value="real-estate">Real Estate</option>
          <option value="saas">SaaS</option>
          <option value="education">Education</option>
          <option value="other">Other</option>
        </select>
        <button type="submit" className="crm-button-primary h-10 px-4">
          Search
        </button>
      </form>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No souls found yet. Try a different niche or query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((listing) => (
            <Link key={listing.id} href={`/soul-marketplace/${listing.slug}`} className="rounded-xl border bg-card overflow-hidden transition hover:border-primary/40">
              {listing.previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.previewImageUrl} alt={listing.name} className="h-44 w-full object-cover" />
              ) : (
                <div className="h-44 w-full bg-muted/40" />
              )}

              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{listing.niche}</span>
                  <span className="text-sm font-semibold text-primary">
                    {listing.price === 0 ? "Free" : `$${(listing.price / 100).toFixed(0)}`}
                  </span>
                </div>
                <h2 className="text-base font-medium text-foreground">{listing.name}</h2>
                <p className="text-sm text-muted-foreground line-clamp-2">{listing.description || "No description yet."}</p>
                <div className="text-xs text-muted-foreground flex items-center gap-3">
                  <span>{listing.installCount} installs</span>
                  {listing.reviewCount > 0 ? <span>{Number(listing.rating ?? 0).toFixed(1)} ★ ({listing.reviewCount})</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
