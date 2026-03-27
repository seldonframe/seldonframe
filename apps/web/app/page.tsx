import { Blocks } from "@/components/blocks";
import { EmailCapture } from "@/components/email-capture";
import { Footer } from "@/components/footer";
import { ForBuilders } from "@/components/for-builders";
import { FullFlow } from "@/components/full-flow";
import { Hero } from "@/components/hero";
import { Intelligence } from "@/components/intelligence";
import { Pricing } from "@/components/pricing";
import { Problem } from "@/components/problem";
import { Showcase } from "@/components/showcase";
import { SocialProofBar } from "@/components/social-proof-bar";
import { SoulSystem } from "@/components/soul-system";
import { BackToTop } from "@/components/back-to-top";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Page() {
  return (
    <main className="bg-background text-foreground">
      <ThemeToggle />
      <BackToTop />
      <Hero />
      <div className="section-divider" />
      <SocialProofBar />
      <div className="section-divider" />
      <Problem />
      <div className="section-divider" />
      <SoulSystem />
      <div className="section-divider" />
      <Blocks />
      <div className="section-divider" />
      <FullFlow />
      <div className="section-divider" />
      <ForBuilders />
      <div className="section-divider" />
      <Showcase />
      <div className="section-divider" />
      <Pricing />
      <div className="section-divider" />
      <Intelligence />
      <div className="section-divider" />
      <EmailCapture />
      <div className="section-divider" />
      <Footer />
    </main>
  );
}
