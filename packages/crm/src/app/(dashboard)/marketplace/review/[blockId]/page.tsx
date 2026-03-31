import Link from "next/link";
import { approveGeneratedBlockAction, getSellerReviewBlock, rejectGeneratedBlockAction } from "@/lib/marketplace/actions";

export default async function MarketplaceReviewPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { blockId } = await params;
  const block = await getSellerReviewBlock(blockId);

  const files = Array.isArray(block.files) ? block.files : [];

  return (
    <section className="animate-page-enter space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title">Review: {block.name}</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Under review. Only your org can preview this generated block.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{block.generationStatus}</span>
      </div>

      <article className="glass-card rounded-2xl p-5">
        <h2 className="text-card-title">Preview</h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Open the temporary preview route for this block in your org:
        </p>
        <Link href={`/${block.blockId}`} className="mt-3 inline-flex rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm">
          /{block.blockId}
        </Link>
      </article>

      <article className="glass-card rounded-2xl p-5">
        <h2 className="text-card-title">Generated files</h2>
        {files.length === 0 ? (
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">No generated files yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {files.map((file) => {
              const item = file as { path?: string };
              return (
                <li key={item.path || Math.random()} className="rounded border border-[hsl(var(--border))] px-3 py-2 font-mono text-xs">
                  {item.path || "unknown-file"}
                </li>
              );
            })}
          </ul>
        )}
      </article>

      {block.reviewNotes ? (
        <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{block.reviewNotes}</article>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <form action={approveGeneratedBlockAction}>
          <input type="hidden" name="blockId" value={block.blockId} />
          <button type="submit" className="crm-button-primary h-10 w-full px-4">Approve &amp; Send to Admin</button>
        </form>

        <form action={rejectGeneratedBlockAction} className="grid gap-2">
          <input type="hidden" name="blockId" value={block.blockId} />
          <textarea
            name="reviewNotes"
            className="crm-input min-h-20 w-full p-3 text-sm"
            placeholder="What should change before resubmission?"
          />
          <button type="submit" className="h-10 rounded-md border border-[hsl(var(--border))] px-4 text-sm">
            Request Changes
          </button>
        </form>
      </div>
    </section>
  );
}
