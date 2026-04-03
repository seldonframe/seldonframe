import type { Metadata } from "next";
import { Fira_Code } from "next/font/google";
import { DemoToastProvider } from "@/components/shared/demo-toast-provider";
import { ThemeProvider } from "@/components/shared/theme-provider";
import "./globals.css";

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Seldon Frame",
  description: "Open source CRM framework scaffold",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${firaCode.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <DemoToastProvider>{children}</DemoToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
