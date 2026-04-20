import type { BrainRecordInsight } from "@/lib/brain-record-insights";

export function BrainInsightSection({ insight, endClientMode = false }: { insight: BrainRecordInsight | null; endClientMode?: boolean }) {
  if (!insight) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border/80 bg-card/70 p-5 shadow-(--shadow-xs)">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-card-title">{insight.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{insight.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {insight.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">
              {tag}
            </span>
          ))}
          <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">
            Updated {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(insight.generatedAt))}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h3 className="text-sm font-medium text-foreground">Signals</h3>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            {insight.signals.length > 0 ? (
              insight.signals.map((signal) => (
                <div key={signal} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                  {signal}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 bg-background/50 px-3 py-2">
                Brain is still compiling enough signal for this record.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {!endClientMode && insight.trend ? (
            <div>
              <h3 className="text-sm font-medium text-foreground">Trend</h3>
              <p className="mt-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm text-muted-foreground">{insight.trend}</p>
            </div>
          ) : null}

          {!endClientMode && insight.references.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-foreground">Brain References</h3>
              <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                {insight.references.map((reference) => (
                  <div key={reference} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                    {reference}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
