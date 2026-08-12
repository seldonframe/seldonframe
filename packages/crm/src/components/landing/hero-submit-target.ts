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

// Persona-loop finding (2026-07-26): the hero's transitional loading overlay
// said "Spinning up your workspace…" for EVERY submission, but per
// heroSubmitTarget above the biz tab (and the url tab with the flag off)
// never spins up a workspace at all — they redirect straight to a Google-
// OAuth signup wall with no build, no preview. A visitor who described their
// business (the natural choice for someone with no real website — a common
// case for a solo small-business owner) watched a fake "building" animation
// that lied about what was about to happen. This mirrors heroSubmitTarget's
// own branch so the two can never drift out of sync.
export function heroSubmitLoadingMessage(
  tab: HeroTabKind,
  ungatedBuildEnabled: boolean,
): string {
  return ungatedBuildEnabled && tab === "url"
    ? "Spinning up your workspace…"
    : "Taking you to sign up…";
}
