import { listAdminReviewQueue, mergeGeneratedBlockAction } from "@/lib/marketplace/actions";

export default async function AdminBlockReviewPage() {
  const queue = await listAdminReviewQueue();

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Admin Block Review Queue</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Seller-approved blocks wait here for final code merge approval.
        </p>
      </div>

      {queue.length === 0 ? (
        <article className="glass-card rounded-2xl p-6 text-sm text-[hsl(var(--muted-foreground))]">No blocks awaiting admin merge.</article>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => {
            const files = Array.isArray(item.files) ? item.files : [];

            return (
              <article key={item.blockId} className="glass-card rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-card-title">{item.name}</h2>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      {item.blockId} • Seller: {item.sellerName}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{item.generationStatus}</span>
                </div>

                <div className="mt-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">Generated files</p>
                  <ul className="mt-2 space-y-2">
                    {files.map((file) => {
                      const entry = file as { path?: string };
                      return (
                        <li key={entry.path || Math.random()} className="rounded border border-[hsl(var(--border))] px-3 py-2 font-mono text-xs">
                          {entry.path || "unknown-file"}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <form action={mergeGeneratedBlockAction} className="mt-4">
                  <input type="hidden" name="blockId" value={item.blockId} />
                  <button type="submit" className="crm-button-primary h-10 px-5">
                    Merge &amp; Publish
                  </button>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
