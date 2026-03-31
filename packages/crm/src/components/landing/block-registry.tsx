import type { Editor } from "grapesjs";
import type { ReactNode } from "react";
import { BenefitsSection } from "./sections/benefits";
import { CTASection } from "./sections/cta";
import { FAQSection } from "./sections/faq";
import { FeaturesSection } from "./sections/features";
import { FooterSection } from "./sections/footer";
import { HeroSection } from "./sections/hero";
import { NavbarSection } from "./sections/navbar";
import { PricingSection } from "./sections/pricing";
import { ProcessSection } from "./sections/process";
import { TestimonialsSection } from "./sections/testimonials";
import type {
  BenefitsSectionContent,
  CTASectionContent,
  FAQSectionContent,
  FeaturesSectionContent,
  FooterSectionContent,
  HeroSectionContent,
  LandingPageSection,
  NavbarSectionContent,
  PricingSectionContent,
  ProcessSectionContent,
  TestimonialsSectionContent,
  WhoItsForSectionContent,
} from "./sections/types";
import { WhoItsForSection } from "./sections/whoitsfor";

export type LandingSectionType = LandingPageSection["type"];

export type BlockManifest = {
  type: LandingSectionType;
  label: string;
  category: string;
  grapesId: string;
  grapesContent: string;
  render: (content: Record<string, unknown>, key: string) => ReactNode;
};

export type BlockRegistry = ReadonlyArray<BlockManifest>;

export type LandingBlockDefinition = BlockManifest;

export const landingBlockRegistry: BlockRegistry = [
  {
    type: "navbar",
    label: "Navbar",
    category: "SeldonFrame",
    grapesId: "sf-navbar",
    grapesContent:
      '<header class="py-4 border-b"><div class="container mx-auto flex items-center justify-between"><div class="font-semibold">Your Business</div><nav class="space-x-4"><a href="#features">Features</a><a href="#pricing">Pricing</a></nav><a href="#cta" class="px-4 py-2 rounded bg-primary text-white">Book Now</a></div></header>',
    render: (content, key) => <NavbarSection key={key} {...(content as NavbarSectionContent)} />,
  },
  {
    type: "hero",
    label: "Hero Section",
    category: "SeldonFrame",
    grapesId: "sf-hero",
    grapesContent:
      '<section class="py-20 text-center"><p class="text-sm uppercase tracking-wider text-muted">For your clients</p><h1 class="text-5xl font-bold mt-2">Your Headline Here</h1><p class="text-xl text-muted mt-4 max-w-2xl mx-auto">Your compelling subheadline that explains what you do and why it matters.</p><a href="#cta" class="mt-8 inline-block px-8 py-3 bg-primary text-white rounded-lg">Book a Call</a></section>',
    render: (content, key) => <HeroSection key={key} {...(content as HeroSectionContent)} />,
  },
  {
    type: "benefits",
    label: "Benefits",
    category: "SeldonFrame",
    grapesId: "sf-benefits",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-12">Why Choose Us</h2><div class="grid grid-cols-3 gap-8 max-w-5xl mx-auto"><div class="text-center p-6"><div class="text-4xl mb-4">✨</div><h3 class="text-xl font-semibold">Benefit One</h3><p class="text-muted mt-2">Description of the first benefit.</p></div><div class="text-center p-6"><div class="text-4xl mb-4">🎯</div><h3 class="text-xl font-semibold">Benefit Two</h3><p class="text-muted mt-2">Description of the second benefit.</p></div><div class="text-center p-6"><div class="text-4xl mb-4">💡</div><h3 class="text-xl font-semibold">Benefit Three</h3><p class="text-muted mt-2">Description of the third benefit.</p></div></div></section>',
    render: (content, key) => <BenefitsSection key={key} {...(content as BenefitsSectionContent)} />,
  },
  {
    type: "whoitsfor",
    label: "Who It's For",
    category: "SeldonFrame",
    grapesId: "sf-whoitsfor",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-12">Who this is for</h2><div class="grid grid-cols-3 gap-6 max-w-5xl mx-auto"><div class="p-6 border rounded-xl">Founders</div><div class="p-6 border rounded-xl">Coaches</div><div class="p-6 border rounded-xl">Consultants</div></div></section>',
    render: (content, key) => <WhoItsForSection key={key} {...(content as WhoItsForSectionContent)} />,
  },
  {
    type: "features",
    label: "Features",
    category: "SeldonFrame",
    grapesId: "sf-features",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-8">Features</h2><div class="flex flex-wrap gap-2 justify-center"><span class="px-3 py-1 border rounded-full">Automation</span><span class="px-3 py-1 border rounded-full">Pipeline</span><span class="px-3 py-1 border rounded-full">Booking</span></div></section>',
    render: (content, key) => <FeaturesSection key={key} {...(content as FeaturesSectionContent)} />,
  },
  {
    type: "process",
    label: "Process",
    category: "SeldonFrame",
    grapesId: "sf-process",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-12">How it works</h2><div class="grid grid-cols-3 gap-6 max-w-5xl mx-auto"><div class="p-6 border rounded-xl text-center">1. Start</div><div class="p-6 border rounded-xl text-center">2. Build</div><div class="p-6 border rounded-xl text-center">3. Scale</div></div></section>',
    render: (content, key) => <ProcessSection key={key} {...(content as ProcessSectionContent)} />,
  },
  {
    type: "testimonials",
    label: "Testimonials",
    category: "SeldonFrame",
    grapesId: "sf-testimonials",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-10">What clients say</h2><div class="grid grid-cols-2 gap-6 max-w-5xl mx-auto"><blockquote class="p-6 border rounded-xl">"Amazing results"</blockquote><blockquote class="p-6 border rounded-xl">"Best decision"</blockquote></div></section>',
    render: (content, key) => <TestimonialsSection key={key} {...(content as TestimonialsSectionContent)} />,
  },
  {
    type: "pricing",
    label: "Pricing",
    category: "SeldonFrame",
    grapesId: "sf-pricing",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-10">Pricing</h2><div class="grid grid-cols-3 gap-6 max-w-6xl mx-auto"><div class="p-6 border rounded-xl">Starter</div><div class="p-6 border rounded-xl">Growth</div><div class="p-6 border rounded-xl">Pro</div></div></section>',
    render: (content, key) => <PricingSection key={key} {...(content as PricingSectionContent)} />,
  },
  {
    type: "faq",
    label: "FAQ",
    category: "SeldonFrame",
    grapesId: "sf-faq",
    grapesContent:
      '<section class="py-20 max-w-4xl mx-auto"><h2 class="text-3xl font-bold text-center mb-8">FAQ</h2><details class="p-4 border rounded-xl mb-2"><summary>Question one?</summary><p class="mt-2">Answer one.</p></details><details class="p-4 border rounded-xl"><summary>Question two?</summary><p class="mt-2">Answer two.</p></details></section>',
    render: (content, key) => <FAQSection key={key} {...(content as FAQSectionContent)} />,
  },
  {
    type: "cta",
    label: "Call to Action",
    category: "SeldonFrame",
    grapesId: "sf-cta",
    grapesContent:
      '<section class="py-20 text-center"><h2 class="text-3xl font-bold">Ready to Get Started?</h2><p class="text-xl text-muted mt-4 max-w-xl mx-auto">Your compelling closing message here.</p><a href="/book" class="mt-8 inline-block px-8 py-3 bg-primary text-white rounded-lg">Book Your Session</a></section>',
    render: (content, key) => <CTASection key={key} {...(content as CTASectionContent)} />,
  },
  {
    type: "footer",
    label: "Footer",
    category: "SeldonFrame",
    grapesId: "sf-footer",
    grapesContent:
      '<footer class="py-10 border-t"><div class="container mx-auto text-center text-sm">Your Business · All rights reserved</div></footer>',
    render: (content, key) => <FooterSection key={key} {...(content as FooterSectionContent)} />,
  },
];

const landingBlockMap = new Map<LandingSectionType, BlockManifest>(landingBlockRegistry.map((entry) => [entry.type, entry]));

export function getLandingBlockManifest(type: LandingSectionType): BlockManifest | null {
  return landingBlockMap.get(type) ?? null;
}

export function getLandingBlockDefinition(type: LandingSectionType) {
  return getLandingBlockManifest(type);
}

export function registerLandingBlocks(editor: Editor) {
  for (const block of landingBlockRegistry) {
    editor.BlockManager.add(block.grapesId, {
      label: block.label,
      category: block.category,
      content: block.grapesContent,
    });
  }
}
