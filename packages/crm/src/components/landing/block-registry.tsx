import type { Editor } from "grapesjs";
import type { ReactNode } from "react";
import { BenefitsSection } from "./sections/benefits";
import { ChatbotPreviewSection } from "./sections/chatbot-preview";
import { CTASection } from "./sections/cta";
import { EmergencyStripSection } from "./sections/emergency-strip";
import { FAQSection } from "./sections/faq";
import { FeaturesSection } from "./sections/features";
import { FooterSection } from "./sections/footer";
import { HeroSection } from "./sections/hero";
import { NavbarSection } from "./sections/navbar";
import { PricingSection } from "./sections/pricing";
import { ProcessSection } from "./sections/process";
import { ProjectGallerySection } from "./sections/project-gallery";
import { ServiceAreaSection } from "./sections/service-area";
import { ServicesGridSection } from "./sections/services-grid";
import { StickyMobileCTASection } from "./sections/sticky-mobile-cta";
import { TestimonialsSection } from "./sections/testimonials";
import type {
  BenefitsSectionContent,
  ChatbotPreviewSectionContent,
  CTASectionContent,
  EmergencyStripSectionContent,
  FAQSectionContent,
  FeaturesSectionContent,
  FooterSectionContent,
  HeroSectionContent,
  LandingPageSection,
  NavbarSectionContent,
  PricingSectionContent,
  ProcessSectionContent,
  ProjectGallerySectionContent,
  ServiceAreaSectionContent,
  ServicesGridSectionContent,
  StickyMobileCTASectionContent,
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
  // v1.36.0 — services-grid block. Per-service cards with price +
  // duration + Book CTA. THE missing block on local-service business
  // landing pages. Use INSTEAD of the generic pricing tiers block
  // when pricing is per-service (trades, salons, mobile mechanics,
  // etc.) rather than per-tier (SaaS, coaches, gyms).
  {
    type: "servicesGrid",
    label: "Services Grid",
    category: "SeldonFrame",
    grapesId: "sf-services-grid",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-12">Our Services</h2><div class="grid grid-cols-3 gap-4 max-w-6xl mx-auto"><div class="p-6 border rounded-2xl"><h3 class="text-lg font-semibold">Service 1</h3><p class="text-muted mt-2">Description.</p><div class="mt-4 font-bold">From $99</div></div></div></section>',
    render: (content, key) => <ServicesGridSection key={key} {...(content as ServicesGridSectionContent)} />,
  },
  // v1.36.0 — emergency-strip block. High-prominence "if it's an
  // emergency, call X" banner for trades businesses where after-hours
  // emergencies are the highest-LTV customer segment. Place
  // immediately below the hero on plumbing / HVAC / locksmith /
  // towing / roofing pages.
  {
    type: "emergencyStrip",
    label: "Emergency Call Strip",
    category: "SeldonFrame",
    grapesId: "sf-emergency-strip",
    grapesContent:
      '<section class="py-8"><div class="rounded-2xl bg-primary text-white px-6 py-6 flex items-center justify-between max-w-6xl mx-auto"><div><p class="uppercase text-xs">Emergency</p><h3 class="text-xl font-bold">Pipe burst? Roof leaking? Don\'t wait.</h3></div><a href="tel:" class="inline-block bg-white text-primary px-5 py-3 rounded-full font-bold">(555) 555-0100</a></div></section>',
    render: (content, key) => <EmergencyStripSection key={key} {...(content as EmergencyStripSectionContent)} />,
  },
  // v1.36.0 — service-area block. Chip cloud of cities/neighborhoods
  // served. Answers "do you cover my city?" without forcing a map
  // integration.
  {
    type: "serviceArea",
    label: "Service Area",
    category: "SeldonFrame",
    grapesId: "sf-service-area",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-8">Service Area</h2><div class="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto"><span class="px-4 py-2 border rounded-full">City 1</span><span class="px-4 py-2 border rounded-full">City 2</span><span class="px-4 py-2 border rounded-full">City 3</span></div></section>',
    render: (content, key) => <ServiceAreaSection key={key} {...(content as ServiceAreaSectionContent)} />,
  },
  // v1.38.1 — project-gallery block. Stock-photo masonry that makes a
  // trades landing page feel populated. Auto-fetched per service via
  // Unsplash inside enhanceLandingForWorkspace.
  {
    type: "projectGallery",
    label: "Project Gallery",
    category: "SeldonFrame",
    grapesId: "sf-project-gallery",
    grapesContent:
      '<section class="py-20"><h2 class="text-3xl font-bold text-center mb-8">Recent Work</h2><div class="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-6xl mx-auto"><div class="aspect-square bg-muted rounded-2xl"></div><div class="aspect-square bg-muted rounded-2xl"></div><div class="aspect-square bg-muted rounded-2xl"></div><div class="aspect-square bg-muted rounded-2xl"></div></div></section>',
    render: (content, key) => <ProjectGallerySection key={key} {...(content as ProjectGallerySectionContent)} />,
  },
  // v1.38.2 — sticky-mobile-cta. Fixed bottom-of-screen call/book
  // bar, MOBILE ONLY. Hides on desktop where the navbar's CTAs are
  // already reachable.
  {
    type: "stickyMobileCTA",
    label: "Sticky Mobile CTA",
    category: "SeldonFrame",
    grapesId: "sf-sticky-mobile-cta",
    grapesContent:
      '<div class="fixed bottom-0 inset-x-0 border-t bg-card md:hidden flex"><a class="flex-1 py-4 text-center" href="tel:">Call</a><a class="flex-1 py-4 text-center bg-primary text-white" href="/book">Book</a></div>',
    render: (content, key) => <StickyMobileCTASection key={key} {...(content as StickyMobileCTASectionContent)} />,
  },
  // v1.55.0 — chatbot-preview block. Default public surface for a fresh
  // workspace BEFORE the operator generates a landing page: a full-page
  // branded chat interface that loads the workspace's website-chatbot
  // agent via embed.js. Operator can share this URL with their client
  // to demo the AI receptionist, then copy the visible snippet onto the
  // client's existing site. Evicted whenever a real landing page is
  // persisted.
  {
    type: "chatbot-preview",
    label: "Chatbot Preview (default public surface)",
    category: "SeldonFrame",
    grapesId: "sf-chatbot-preview",
    grapesContent:
      '<section class="py-20 text-center"><h1 class="text-4xl font-semibold">Your Business</h1><p class="mt-3 opacity-70">AI receptionist — ask anything</p><div class="mt-12 rounded-2xl border p-8 min-h-[400px]">Loading your AI receptionist…</div></section>',
    render: (content, key) => (
      <ChatbotPreviewSection
        key={key}
        {...(content as unknown as ChatbotPreviewSectionContent)}
      />
    ),
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
