// packages/crm/src/components/landing/describe-it-step-copy.ts
//
// Pure helper extracted from marketing-build-steps.tsx so the "How it
// works" step copy can be unit-tested without dragging in the
// framer-motion/JSX-heavy component.
//
// The homepage's "Describe it" path card (id="build") lists step 1 as
// "Paste your client's URL or describe their business" then step 2 as
// "Watch it build — site, booking, CRM, agent" — implying both inputs lead
// to the same instant build. They don't: per hero-submit-target.ts's
// heroSubmitTarget, only the "url" tab builds anonymously when
// ungatedBuildEnabled is on (routes to /try); describing the business
// always routes to /signup first. A visitor who scrolls down to "How it
// works" for reassurance before typing anything sees this card promise an
// instant build for describing too — the same false promise persona-loop
// already flagged on the hero form itself (PRs #102/#147/#162), just
// repeated in a second, untouched section of the page.
//
// When the flag is off, both tabs already route to /signup (see
// hero-submit-target.ts's flag-off branch), so there's no asymmetry to
// disclose — the original copy is accurate in that case.

export function describeItStep1(ungatedBuildEnabled: boolean): string {
  return ungatedBuildEnabled
    ? "Paste your client's URL — instant build. Describing it takes one quick signup first."
    : "Paste your client's URL or describe their business";
}
