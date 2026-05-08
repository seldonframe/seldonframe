"use client";

// v1.30.2 — Docs top header.
//
// Linear-style: brand on left, theme toggle + Sign up CTA on right.
// Sticky (stays visible while scrolling long doc pages). Subtle border
// at bottom — not a heavy shadow.
//
// v1.30.2 — replaced "SF" placeholder text logo with the actual
// SeldonFrame icon used in the dashboard sidebar (/brand/seldonframe-icon.svg).
// Brand-isolated, never themed — matches the dashboard exactly so
// docs feel like the same product.

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun, Search } from "lucide-react";
import { useEffect, useState } from "react";

export function DocsHeader() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
        <Link
          href="/docs"
          className="flex items-center gap-2.5 font-medium text-sm hover:opacity-80 transition-opacity"
        >
          <div className="flex size-7 items-center justify-center overflow-hidden rounded-md border border-border/80 bg-card/80 shadow-(--shadow-xs)">
            <Image
              src="/brand/seldonframe-icon.svg"
              alt="SeldonFrame"
              width={18}
              height={18}
              priority
            />
          </div>
          <span className="text-foreground">
            SeldonFrame <span className="text-muted-foreground">Docs</span>
          </span>
        </Link>

        <div className="flex-1 max-w-md mx-auto hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search docs..."
              className="w-full h-9 pl-9 pr-12 rounded-md border bg-muted/30 text-sm placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {mounted && (
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="size-9 rounded-md inline-flex items-center justify-center hover:bg-accent transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
          )}
          <Link
            href="/login"
            className="hidden sm:inline-flex h-9 items-center px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center px-4 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
