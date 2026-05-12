import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeldonFrame — Open-Source MCP-Native Business OS",
  description:
    "Open-source, MCP-native Business OS. Generate a complete website, booking page, intake form, CRM, and AI receptionist for a local service business in about 3 minutes from a single Google Maps paste. Free tier, no credit card.",
  metadataBase: new URL("https://seldonframe.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SeldonFrame — MCP-Native Business OS",
    description:
      "Generate a complete website, booking, intake form, CRM, and AI receptionist for a local service business in 3 minutes. Free, open source, MCP-native.",
    url: "https://seldonframe.com",
    siteName: "SeldonFrame",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — MCP-Native Business OS",
    description:
      "Generate a complete Business OS for a local service business in 3 minutes. Free, open source.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SeldonFrame",
  url: "https://seldonframe.com",
  logo: "https://seldonframe.com/logo.svg",
  description:
    "Open-source, MCP-native Business OS for local service businesses. Generates website, booking page, intake form, CRM, and AI receptionist from a Google Maps paste in ~3 minutes.",
  sameAs: [
    "https://github.com/seldonframe/crm",
    "https://www.npmjs.com/package/@seldonframe/mcp",
    "https://x.com/maxime_houle",
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
  operatingSystem: "Web, Self-hosted (Next.js)",
  description:
    "MCP-native Business OS that generates a complete operator stack — website, booking page, intake form, CRM, and AI receptionist — from a single Google Maps paste in approximately 3 minutes.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free tier: 1 workspace, all five Business OS surfaces included. BYOK LLM keys.",
  },
  aggregateRating: undefined,
  url: "https://seldonframe.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
        />
        {children}
      </body>
    </html>
  );
}
