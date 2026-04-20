import Link from "next/link";
import { Globe, AtSign, ExternalLink } from "lucide-react";
import type { FooterSectionContent } from "./types";

export function FooterSection({ businessName, description, links = [], socials = [] }: FooterSectionContent) {
  const resolvedLinks = links.length
    ? links
    : [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ];

  const resolvedSocials = socials.length
    ? socials
    : [
        { label: "Website", href: "#" },
        { label: "LinkedIn", href: "#" },
      ];

  function SocialIcon({ label }: { label: string }) {
    const normalized = label.toLowerCase();
    if (normalized.includes("instagram")) {
      return <AtSign className="h-4 w-4" aria-hidden="true" />;
    }
    if (normalized.includes("youtube")) {
      return <ExternalLink className="h-4 w-4" aria-hidden="true" />;
    }
    if (normalized.includes("linkedin")) {
      return <AtSign className="h-4 w-4" aria-hidden="true" />;
    }
    return <Globe className="h-4 w-4" aria-hidden="true" />;
  }

  return (
    <footer className="border-t border-border bg-muted/20 px-5 py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-[1fr,auto,auto] md:items-start">
        <div>
          <p className="text-sm font-semibold text-foreground">{businessName}</p>
          {description ? <p className="mt-2 max-w-sm text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {resolvedLinks.map((link) => (
            <Link key={`${link.label}-${link.href}`} href={link.href} className="text-xs text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {resolvedSocials.map((social) => (
            <Link key={`${social.label}-${social.href}`} href={social.href} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <SocialIcon label={social.label} />
              <span>{social.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
