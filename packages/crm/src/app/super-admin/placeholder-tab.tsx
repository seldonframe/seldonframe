// v1.35.0 — Shared "Coming soon" placeholder for the four tabs that
// land empty in this ship. Each tab page imports + composes this
// with its own ship version + summary so the routes resolve and the
// nav highlight works, but doesn't pretend the data is wired yet.

export function PlaceholderTab({
  title,
  ship,
  summary,
  bullets,
}: {
  title: string;
  ship: string;
  summary: string;
  bullets: string[];
}) {
  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[900px] mx-auto">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-mono mb-2">
          SeldonFrame · {title}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
      </header>

      <div className="rounded-[12px] border border-dashed border-border bg-card/30 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-[0.08em] font-mono text-[#1FAE85] font-semibold">
            Coming in {ship}
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          The plan for this surface, in priority order:
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 leading-relaxed">
              <span className="text-[#1FAE85] mt-[3px] shrink-0">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        For now: see the <a href="/super-admin" className="text-[#1FAE85] hover:underline">Overview</a> for the four hero numbers.
      </p>
    </div>
  );
}
