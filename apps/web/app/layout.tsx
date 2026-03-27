import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeldonFrame — Your business system builds itself",
  description:
    "Open source business operating system for service professionals. CRM, booking, email, landing pages, payments, and client portal — all configured from a 5-minute conversation.",
  openGraph: {
    title: "SeldonFrame — Your business system builds itself",
    description:
      "CRM, booking, email, landing pages, payments, and client portal for coaches, consultants, agencies, and service professionals.",
    url: "https://seldonframe.com",
    siteName: "SeldonFrame",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — Your business system builds itself",
    description: "Open source business OS for service professionals.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
