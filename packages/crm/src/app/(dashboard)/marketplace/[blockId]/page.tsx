import { redirect } from "next/navigation";
import {
  finalizeMarketplacePurchaseReturnAction,
  getMarketplaceBlockDetailsAction,
  purchaseMarketplaceBlockAction,
  submitBlockRatingAction,
} from "@/lib/marketplace/actions";

export default async function MarketplaceBlockDetailPage({ params, searchParams }: { params: Promise<{ blockId: string }>; searchParams: Promise<{ purchased?: string }> }) {
  const { blockId } = await params;
  const { purchased } = await searchParams;

  if (purchased === "true") {
    const formData = new FormData();
    formData.set("blockId", blockId);
    await finalizeMarketplacePurchaseReturnAction(formData);
    redirect(`/marketplace/${blockId}`);
  }

  const details = await getMarketplaceBlockDetailsAction(blockId);
  const block = details.block;

  return (
    <section className="animate-page-enter space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">{block.name}</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">{block.description}</p>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            ★ {Number(block.ratingAverage ?? 0).toFixed(1)} ({block.ratingCount ?? 0}) · {block.installCount ?? 0} installs
          </p>
        </div>
        <div className="rounded-full bg-[hsl(var(--muted)/0.6)] px-3 py-1 text-sm text-[hsl(var(--muted-foreground))]">
          {Number(block.price ?? 0) > 0 ? `$${Number(block.price).toFixed(0)}` : "Free"}
        </div>
      </div>

      <article className="glass-card rounded-2xl p-5">
        <h2 className="text-card-title">Details</h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{block.longDescription || block.description}</p>
        <div className="mt-4 grid gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <p>Seller: {block.sellerName}</p>
          <p>Category: {block.category}</p>
        </div>
      </article>

      <article className="glass-card rounded-2xl p-5">
        <h2 className="text-card-title">Install</h2>
        <form
          action={async (formData) => {
            "use server";
            const result = await purchaseMarketplaceBlockAction(formData);
            if (result.checkoutUrl) {
              redirect(result.checkoutUrl);
            }
            redirect(`/marketplace/${blockId}`);
          }}
          className="mt-3"
        >
          <input type="hidden" name="blockId" value={blockId} />
          <button type="submit" className="crm-button-primary h-10 px-6">
            {details.installed ? "Installed ✓" : Number(block.price ?? 0) > 0 ? `Buy $${Number(block.price).toFixed(0)}` : "Install Free"}
          </button>
        </form>
      </article>

      <article className="glass-card rounded-2xl p-5">
        <h2 className="text-card-title">Reviews</h2>
        <form action={submitBlockRatingAction} className="mt-3 grid gap-3">
          <input type="hidden" name="blockId" value={blockId} />
          <label className="text-sm text-[hsl(var(--muted-foreground))]">
            Rating (1-5)
            <input name="rating" type="number" min="1" max="5" className="crm-input mt-1 h-10 w-full px-3" required />
          </label>
          <label className="text-sm text-[hsl(var(--muted-foreground))]">
            Review
            <textarea name="review" className="crm-input mt-1 min-h-20 w-full p-3" placeholder="Optional" />
          </label>
          <button type="submit" className="h-10 rounded-md border border-[hsl(var(--border))] px-4 text-sm" disabled={!details.canRateNow}>
            {details.canRateNow ? "Submit Review" : "Available after 7 days"}
          </button>
        </form>

        {details.ratings.length === 0 ? (
          <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">No ratings yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {details.ratings.map((rating) => (
              <li key={rating.id} className="rounded border border-[hsl(var(--border))] px-3 py-2">
                <p className="font-medium text-foreground">★ {rating.rating}</p>
                <p className="text-[hsl(var(--muted-foreground))]">{rating.review || "No written review"}</p>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
