// landing-r1/powered-by-badge.tsx
//
// Growth loop #1 (virality pack, Task 1): a small "Built with SeldonFrame"
// credit line rendered once in the R1 site shell's footer, on EVERY generated
// /w site regardless of archetype. Server component, zero client JS — no
// "use client" directive, matches the shell-level (not per-archetype) mount
// point so it renders exactly once per page.
//
// Styling is intentionally minimal and inherits the shell's own CSS
// variables (--text / --border / --font-body) so it reads as "part of the
// page" rather than a foreign injected widget — muted, small, non-blocking.
// It sits OUTSIDE <Footer> (a sibling, appended after it in the shell) so it
// never has to touch the per-archetype Footer markup/styles.
//
// Attribution: the link carries ?ref=<workspaceId>&utm_source=powered_by so
// referred signups can be traced back to the site that sent them (consumed
// by Task 5's referral capture on /build).

export function buildPoweredByHref(workspaceId: string): string {
  const url = new URL("https://www.seldonframe.com/build");
  url.searchParams.set("ref", workspaceId);
  url.searchParams.set("utm_source", "powered_by");
  return url.toString();
}

export type PoweredByBadgeProps = {
  workspaceId: string;
};

export function PoweredByBadge({ workspaceId }: PoweredByBadgeProps) {
  return (
    <div className="sf-powered-by">
      <a
        href={buildPoweredByHref(workspaceId)}
        target="_blank"
        rel="noopener noreferrer"
      >
        ⚡ Built with SeldonFrame — build yours from your IDE
      </a>

      <style jsx global>{`
        .sf-powered-by {
          text-align: center;
          padding: 10px 20px;
        }
        .sf-powered-by a {
          font-family: var(--font-body);
          font-size: 12px;
          color: color-mix(in oklab, var(--text) 45%, transparent);
          text-decoration: none;
          transition: color 140ms;
        }
        .sf-powered-by a:hover {
          color: color-mix(in oklab, var(--text) 70%, transparent);
        }
      `}</style>
    </div>
  );
}
