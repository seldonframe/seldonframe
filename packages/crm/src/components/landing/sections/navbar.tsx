import Link from "next/link";
import Image from "next/image";
import type { NavbarSectionContent } from "./types";

export function NavbarSection({ businessName, logoUrl, navLinks = [], ctaText = "Book Now", ctaLink = "#" }: NavbarSectionContent) {
  const links = navLinks.slice(0, 5);

  return (
    <header className="sticky top-0 z-40 border-b border-border/65 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {logoUrl ? <Image src={logoUrl} alt={businessName} width={32} height={32} className="h-8 w-8 rounded-md object-cover" /> : null}
          <span>{businessName}</span>
        </Link>
        <nav className="hidden items-center gap-4 md:flex">
          {links.map((link) => (
            <Link key={`${link.label}-${link.href}`} href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <Link href={ctaLink} className="crm-button-primary h-9 px-4 text-xs shadow-sm">
          {ctaText}
        </Link>
      </div>
    </header>
  );
}
