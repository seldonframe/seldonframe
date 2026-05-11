import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoToastProvider } from "@/components/shared/demo-toast-provider";
import { ThemeProvider } from "@/components/shared/theme-provider";
import {
  GoogleAnalytics,
  shouldRenderGoogleAnalytics,
} from "@/components/analytics/google-analytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// SLICE 9 PR 2 C1: brand asset application. References go through
// /brand/ (extracted from the canonical asset bundle in the brand
// README). The legacy /logo.svg path is kept on disk for now (not
// removed in this commit) but no longer referenced from layout meta.
export const metadata: Metadata = {
  title: "SeldonFrame",
  description: "AI-native business OS — CRM, booking, intake, brain.",
  manifest: "/brand/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/seldonframe-favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/brand/favicon.ico",
    apple: [{ url: "/brand/favicon-180.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "SeldonFrame",
    description: "AI-native business OS — CRM, booking, intake, brain.",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame",
    description: "AI-native business OS — CRM, booking, intake, brain.",
    images: ["/brand/twitter-card.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // v1.40.14 — Google Analytics, host-aware. Only renders on
  // SeldonFrame-owned hosts (seldonframe.com, app.seldonframe.com).
  // Workspace subdomains and preview deploys get no GA injection
  // — see components/analytics/google-analytics.tsx for the
  // privacy rationale.
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const hostHeader = (await headers()).get("host") ?? "";
  const renderGA =
    Boolean(measurementId) && shouldRenderGoogleAnalytics(hostHeader);

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {renderGA && measurementId ? (
          <GoogleAnalytics measurementId={measurementId} />
        ) : null}
        <ThemeProvider>
          <DemoToastProvider>{children}</DemoToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
