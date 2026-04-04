import Link from "next/link";
import { listMarketplaceBlocksAction, listSellerBlocksForReview } from "@/lib/marketplace/actions";

const categories = [
  "All",
  "Education",
  "Finance",
  "Communication",
  "Client Experience",
  "Integrations",
  "Marketing",
  "Operations",
] as const;

const sortOptions = ["popular", "rated", "newest", "price"] as const;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; sort?: "popular" | "rated" | "newest" | "price" }>;
}) {
  const params = await searchParams;
  const category = params.category || "All";
  const query = params.q || "";
  const sort = params.sort && sortOptions.includes(params.sort) ? params.sort : "newest";

  const [blocks, myBlocks] = await Promise.all([
    listMarketplaceBlocksAction({ category, query, sort }),
    listSellerBlocksForReview(),
  ]);

  return (
    <section className="animate-page-enter space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">Block Marketplace</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">Extend SeldonFrame with new capabilities.</p>
        </div>
        <Link href="/marketplace/submit" className="crm-button-primary h-10 px-4">
          Submit a Block
        </Link>
      </div>

      <form className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_220px_180px]" method="get">
        <input
          className="crm-input h-10 w-full px-3"
          name="q"
          placeholder="Search blocks"
          defaultValue={query}
        />
        <select className="crm-input h-10 w-full px-3" name="category" defaultValue={category}>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="crm-input h-10 w-full px-3" name="sort" defaultValue={sort}>
          <option value="popular">Most Popular</option>
          <option value="rated">Highest Rated</option>
          <option value="newest">Newest</option>
          <option value="price">Price</option>
        </select>
        <button type="submit" className="hidden" />
      </form>

      {blocks.length === 0 ? (
        <article className="rounded-xl border bg-card p-8 text-center">
          <p className="text-base font-medium text-foreground">No blocks match your filters</p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Try a different category, clear search, or submit your own block.</p>
        </article>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {blocks.map((block) => (
            <article key={block.blockId} className="rounded-xl border bg-card p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="text-card-title">{block.name}</h2>
                <span className="rounded-full bg-[hsl(var(--muted)/0.6)] px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {block.price && Number(block.price) > 0 ? `$${Number(block.price).toFixed(0)}` : "Free"}
                </span>
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{block.description}</p>
              <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                ★ {Number(block.ratingAverage ?? 0).toFixed(1)} ({block.ratingCount ?? 0}) · {block.installCount ?? 0} installs
              </p>
              <div className="mt-4">
                <Link href={`/marketplace/${block.blockId}`} className="crm-button-secondary h-9 px-4 text-xs">
                  {block.installed ? "Installed ✓" : Number(block.price ?? 0) > 0 ? `Buy $${Number(block.price).toFixed(0)}` : "Install"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <article className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">My Blocks</h2>
        {myBlocks.length === 0 ? (
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">No submissions yet. Publish your first BLOCK.md to start selling.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {myBlocks.map((item) => (
              <li key={item.blockId} className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2">
                <div>
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.blockId}</p>
                </div>
                <Link href={`/marketplace/review/${item.blockId}`} className="rounded border border-border px-3 py-1.5 text-xs">
                  {item.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
