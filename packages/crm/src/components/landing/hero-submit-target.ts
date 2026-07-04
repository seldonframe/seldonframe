// packages/crm/src/components/landing/hero-submit-target.ts
//
// Pure helper extracted from marketing-hero.tsx so it can be unit-tested
// under node:test/tsx without dragging in the "use client" React component
// (CSS/JSX side effects, DOM globals, etc.).
//
// Flag OFF (ungatedBuildEnabled=false): byte-identical to the pre-web-build
// behavior — always routes to /signup?intent=build(&url=...).
// Flag ON: routes to /try (Task 5's anonymous-build island), which reads
// ?url= directly and falls back to the hero's localStorage seed for the
// business-description tab.

export type HeroTabKind = "url" | "biz";

export function heroSubmitTarget(
  tab: HeroTabKind,
  value: string,
  ungatedBuildEnabled: boolean,
): string {
  if (ungatedBuildEnabled) {
    if (tab === "url") {
      const params = new URLSearchParams({ url: value });
      return `/try?${params.toString()}`;
    }
    return "/try";
  }

  const params = new URLSearchParams({ intent: "build" });
  if (tab === "url") params.set("url", value);
  return `/signup?${params.toString()}`;
}
