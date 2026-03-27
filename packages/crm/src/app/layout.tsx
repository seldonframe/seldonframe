import type { Metadata } from "next";
import { Fira_Code } from "next/font/google";
import { DemoToastProvider } from "@/components/shared/demo-toast-provider";
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
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/favicon.svg",
    apple: "/logo-small.svg",
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
      className={`${firaCode.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <DemoToastProvider>{children}</DemoToastProvider>
      </body>
    </html>
  );
}
