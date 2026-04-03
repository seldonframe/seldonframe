import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeldonFrame — The Operating System for Your Business",
  description:
    "SeldonFrame is a business identity operating system. One brain. Every block. If it doesn't exist — Seldon it into existence. Free and open source.",
  openGraph: {
    title: "SeldonFrame",
    description: "The operating system for your business. One brain. Every block.",
    url: "https://seldonframe.com",
    siteName: "SeldonFrame",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame",
    description: "The operating system for your business. One brain. Every block.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
