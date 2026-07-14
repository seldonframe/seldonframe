// packages/crm/src/app/(public)/unified-landing.tsx
//
// ONE composition, two modes (spec §2). `/` renders it with the mode
// resolved from ?mode=; /record renders it pre-flipped. Section stacks
// are server-rendered and handed to the client shell as children.

// NOTE: landing-theme.css is imported by each route (page.tsx,
// record/page.tsx) — see the header note in landing-mode.tsx.

import type { LandingMode } from "./landing-mode";
import { LandingModeShell } from "@/components/landing/landing-mode";
import { MarketingNav } from "@/components/landing/marketing-nav";
import { MarketingHero } from "@/components/landing/marketing-hero";
import { MarketingProofStrip } from "@/components/landing/marketing-proof-strip";
import { MarketingBuildSteps } from "@/components/landing/marketing-build-steps";
import { MarketingIdeStrip } from "@/components/landing/marketing-ide-strip";
import { MarketingAgentOrbit } from "@/components/landing/marketing-agent-orbit";
import { MarketingModules, MarketingAgents } from "@/components/landing/marketing-modules";
import { MarketingSmbCta } from "@/components/landing/marketing-smb-cta";
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
import { MarketingFinalCta } from "@/components/landing/marketing-final-cta";
import { MarketingFooter } from "@/components/landing/marketing-footer";
import { RecordHero } from "@/components/landing/record/record-hero";
import { RecordSteps } from "@/components/landing/record/record-steps";
import { RecordWhatYouGet } from "@/components/landing/record/record-what-you-get";
import { RecordProof } from "@/components/landing/record/record-proof";
import { RecordFaq } from "@/components/landing/record/record-faq";

export type RecordSurfaceProps = {
  claimedSessionId: string | null;
  claimed: boolean;
  isAuthed: boolean;
  sharedFlag?: "1" | "miss" | null;
};

export function UnifiedLanding({
  initialMode,
  recordEnabled,
  urlStrategy,
  tierLadderOn,
  ungatedBuildEnabled,
  recordProps,
  recordFaqWithSchema = false,
}: {
  initialMode: LandingMode;
  recordEnabled: boolean;
  urlStrategy: "replace-state" | "navigate-home";
  tierLadderOn: boolean;
  ungatedBuildEnabled: boolean;
  recordProps: RecordSurfaceProps;
  /** true only on /record — FAQPage JSON-LD must not duplicate on / */
  recordFaqWithSchema?: boolean;
}) {
  return (
    <LandingModeShell
      initialMode={initialMode}
      recordEnabled={recordEnabled}
      urlStrategy={urlStrategy}
      nav={<MarketingNav />}
      footer={<MarketingFooter />}
      buildStack={
        <>
          <MarketingHero ungatedBuildEnabled={ungatedBuildEnabled} />
          {/* IDE strip sits right above the orbit — "build it with one command"
              then "one agent, your whole stack". */}
          <MarketingIdeStrip />
          <MarketingAgentOrbit />
          {/* How it works → the payoff ("Either way, you get the whole front
              office") → the agent catalog, kept adjacent so the two-ways idea
              pays off immediately. */}
          <MarketingBuildSteps />
          <MarketingModules />
          <MarketingAgents />
          <MarketingSmbCta />
          <LandingMarketingPricingSection tierLadderOn={tierLadderOn} />
          <MarketingProofStrip />
          <LandingMarketingFaqSection />
          <MarketingFinalCta />
        </>
      }
      recordStack={
        <>
          <RecordHero {...recordProps} />
          <RecordSteps />
          <RecordWhatYouGet />
          <RecordProof />
          <LandingMarketingPricingSection tierLadderOn={tierLadderOn} />
          <RecordFaq withSchema={recordFaqWithSchema} />
          <MarketingFinalCta variant="record" />
        </>
      }
    />
  );
}
