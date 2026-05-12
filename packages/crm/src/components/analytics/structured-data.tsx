// Structured data (JSON-LD) for SeldonFrame's marketing surface.
//
// Renders Organization + WebSite + SoftwareApplication schema as
// `<script type="application/ld+json">` blocks. AI engines
// (Perplexity, ChatGPT Search, Claude Search, Google AI Overview)
// extract these to anchor entity definitions and citation links.
//
// Host-aware, like the GoogleAnalytics component:
//   1. seldonframe.com / www.seldonframe.com (marketing) → render ✅
//   2. app.seldonframe.com (operator dashboard)          → SKIP ❌
//   3. <slug>.app.seldonframe.com (workspace subdomains) → SKIP ❌
//   4. localhost / preview deploys                       → SKIP ❌
//
// Why we don't render on app.seldonframe.com or workspaces:
//   - The operator dashboard isn't the marketing entity; injecting
//     SoftwareApplication schema there confuses crawlers about which
//     URL is canonical for the product page.
//   - Workspace subdomains represent the operator's business
//     (HVAC contractor, dental practice, etc.), not SeldonFrame.
//     Those workspaces ship their own LocalBusiness schema generated
//     per workspace — not SeldonFrame's Organization schema.
//
// The allowlist is identical to GA's: same hosts, same rationale.

/**
 * Allowlist of hosts where the SeldonFrame-marketing JSON-LD is
 * safe to render. Mirrors GA_ALLOWED_HOSTS in google-analytics.tsx.
 */
const STRUCTURED_DATA_ALLOWED_HOSTS = new Set<string>([
  "seldonframe.com",
  "www.seldonframe.com",
]);

/**
 * Decide whether to inject SeldonFrame-marketing JSON-LD based on
 * the request host. Called from the root layout server-side
 * (via next/headers).
 *
 * NOTE: stricter than GA's allowlist. GA includes
 * app.seldonframe.com (we want analytics on the dashboard too).
 * Structured data does NOT include the dashboard — the dashboard
 * is not the marketing entity.
 */
export function shouldRenderMarketingStructuredData(host: string): boolean {
  const cleanHost = host.split(":")[0].toLowerCase();
  return STRUCTURED_DATA_ALLOWED_HOSTS.has(cleanHost);
}

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SeldonFrame",
  url: "https://seldonframe.com",
  logo: "https://seldonframe.com/brand/seldonframe-icon.svg",
  description:
    "Open-source alternative to GoHighLevel. SeldonFrame generates a pre-wired client operations stack — CRM, booking page, intake form, and AI chatbot — that agencies deploy per client in minutes. Built for freelance web designers and small agencies serving local service businesses.",
  sameAs: [
    "https://github.com/seldonframe/seldonframe",
    "https://www.npmjs.com/package/@seldonframe/mcp",
    "https://x.com/seldonframe",
    "https://discord.gg/sbVUu976NW",
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SeldonFrame",
  url: "https://seldonframe.com",
  publisher: {
    "@type": "Organization",
    name: "SeldonFrame",
  },
};

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SeldonFrame",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Self-hosted (Next.js, AGPL-3.0)",
  description:
    "Open-source alternative to GoHighLevel. SeldonFrame is a pre-wired client operations stack — CRM, booking page, intake form, and AI chatbot — that agencies deploy per client in minutes via Claude Code and the @seldonframe/mcp server. Everything is connected on generation: the chatbot books against the real calendar, the intake form writes to the real CRM, the booking page respects the client's hours and timezone. No Zapier, no integration work. Built for freelance web designers and small agencies serving local service businesses including HVAC contractors, plumbers, electricians, dental practices, salons, and roofers.",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description:
        "Free tier: 1 complete client workspace (CRM, booking, intake, AI chatbot). No credit card. BYOK LLM keys, no token margin.",
    },
    {
      "@type": "Offer",
      name: "Growth",
      price: "29",
      priceCurrency: "USD",
      description:
        "Growth tier: 3 client workspaces, custom domains. Designed for solo agencies serving 2-3 clients.",
    },
    {
      "@type": "Offer",
      name: "Scale",
      price: "99",
      priceCurrency: "USD",
      description:
        "Scale tier: unlimited client workspaces. Designed for agencies serving 5+ clients.",
    },
  ],
  url: "https://seldonframe.com",
};

/**
 * Renders the three SeldonFrame-marketing JSON-LD scripts.
 *
 * Caller is responsible for the host-allowlist check via
 * `shouldRenderMarketingStructuredData()`. This component is rendered
 * unconditionally once that check passes.
 */
export function MarketingStructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema),
        }}
      />
    </>
  );
}
