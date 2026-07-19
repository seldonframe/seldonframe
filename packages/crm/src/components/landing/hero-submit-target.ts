// packages/crm/src/components/landing/hero-submit-target.ts
//
// Pure helper extracted from marketing-hero.tsx so it can be unit-tested
// under node:test/tsx without dragging in the "use client" React component
// (CSS/JSX side effects, DOM globals, etc.).
//
// Flag OFF (ungatedBuildEnabled=false): byte-identical to the pre-web-build
// behavior — always routes to /signup?intent=build(&url=...).
// Flag ON: the url tab routes to /try (the anonymous-build island, which is
// URL-only — its GET .../build/stream takes no text/biz param). The biz tab
// must NOT go to /try: it would dead-end on a read-only echo of the
// description ("URL builds only for now"). It routes to /signup?intent=build,
// where the hero's localStorage seed feeds the existing signup → /clients/new
// description-build pipeline.

export type HeroTabKind = "url" | "biz";

export function heroSubmitTarget(
  tab: HeroTabKind,
  value: string,
  ungatedBuildEnabled: boolean,
): string {
  if (ungatedBuildEnabled && tab === "url") {
    const params = new URLSearchParams({ url: value });
    return `/try?${params.toString()}`;
  }

  const params = new URLSearchParams({ intent: "build" });
  if (tab === "url") params.set("url", value);
  return `/signup?${params.toString()}`;
}
