import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { marketplaceListings, marketplaceReviews, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { submitSoulListingReviewAction } from "@/lib/marketplace/actions";
import type { SoulPackage } from "@/lib/marketplace/soul-package";

type SoulDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function SoulDetailPage({ params }: SoulDetailPageProps) {
  const { slug } = await params;
  const orgId = await getOrgId();

  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!listing) {
    notFound();
  }

  const reviews = await db
    .select({ id: marketplaceReviews.id, rating: marketplaceReviews.rating, review: marketplaceReviews.review, createdAt: marketplaceReviews.createdAt })
    .from(marketplaceReviews)
    .where(eq(marketplaceReviews.listingId, listing.id))
    .orderBy(desc(marketplaceReviews.createdAt))
    .limit(10);

  const [org] = orgId
    ? await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
    : [null];

  const installedListingIds = readInstalledListingIds(org?.settings as Record<string, unknown> | null | undefined);
  const isInstalled = installedListingIds.includes(listing.id);

  const pkg = listing.soulPackage as SoulPackage;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{listing.niche}</span>
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{listing.name}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">{listing.description || "No description provided."}</p>
          <p className="text-sm text-muted-foreground">by {pkg.meta.creatorName}</p>

          <div className="flex items-end gap-3">
            <p className="text-2xl font-semibold text-foreground">{listing.price === 0 ? "Free" : `$${(listing.price / 100).toFixed(0)}`}</p>
            <p className="text-sm text-muted-foreground">
              {listing.installCount} installs{listing.reviewCount > 0 ? ` · ${Number(listing.rating ?? 0).toFixed(1)} ★` : ""}
            </p>
          </div>

          {isInstalled ? (
            <a href="/dashboard" className="crm-button-secondary h-10 px-6 inline-flex items-center">
              Installed ✓
            </a>
          ) : (
            <a href={`/soul-marketplace/${listing.slug}/install`} className="crm-button-primary h-10 px-6 inline-flex items-center">
              Install This Soul
            </a>
          )}
        </div>

        <div>
          {listing.previewImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.previewImageUrl} alt={listing.name} className="w-full rounded-xl border object-cover" />
          ) : (
            <div className="w-full min-h-56 rounded-xl border bg-muted/40" />
          )}
        </div>
      </div>

      <article className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-card-title">What&apos;s Included</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-medium text-foreground">Theme</h3>
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full border" style={{ backgroundColor: pkg.theme.primaryColor }} />
              <span className="h-6 w-6 rounded-full border" style={{ backgroundColor: pkg.theme.accentColor }} />
              <span className="text-xs text-muted-foreground">{pkg.theme.fontFamily} · {pkg.theme.mode}</span>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-medium text-foreground">Business Knowledge</h3>
            <p className="text-xs text-muted-foreground">{pkg.wiki.articles.length} compiled articles</p>
          </div>

          <div className="rounded-lg border p-4 space-y-2 md:col-span-2">
            <h3 className="text-sm font-medium text-foreground">Pre-Built Blocks ({pkg.blocks.templates.length})</h3>
            <div className="flex flex-wrap gap-2">
              {pkg.blocks.templates.map((template, index) => (
                <span key={`${template.slug}-${index}`} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {template.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </article>

      {listing.longDescription ? (
        <article className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="text-card-title">About This Soul</h2>
          <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: markdownToHtml(listing.longDescription) }} />
        </article>
      ) : null}

      {reviews.length > 0 ? (
        <article className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-card-title">Reviews</h2>

          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-lg border p-3 space-y-2">
                <div className="text-sm text-amber-500">{"★".repeat(Math.max(1, Math.min(5, review.rating)))}{"☆".repeat(Math.max(0, 5 - review.rating))}</div>
                {review.review ? <p className="text-sm text-foreground">{review.review}</p> : null}
                <p className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <article className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-card-title">Leave a Review</h2>
        <form action={submitSoulListingReviewAction} className="grid gap-3">
          <input type="hidden" name="slug" value={listing.slug} />
          <label className="text-sm text-muted-foreground">
            Rating (1-5)
            <input name="rating" type="number" min="1" max="5" required className="crm-input mt-1 h-10 w-full px-3" disabled={!isInstalled} />
          </label>
          <label className="text-sm text-muted-foreground">
            Review
            <textarea name="review" className="crm-input mt-1 min-h-24 w-full p-3" placeholder="Optional" disabled={!isInstalled} />
          </label>
          <button type="submit" className="crm-button-primary h-10 px-4 w-fit" disabled={!isInstalled}>
            Submit Review
          </button>
          <p className="text-xs text-muted-foreground">
            {isInstalled ? "Thanks for installing — you can leave or update your review anytime." : "Install this soul first to leave a review."}
          </p>
        </form>
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

function markdownToHtml(markdown: string) {
  return markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^###\s(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s(.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, "<br/><br/>");
}
