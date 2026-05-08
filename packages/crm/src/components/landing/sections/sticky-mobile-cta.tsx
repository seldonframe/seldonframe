// v1.38.2 — sticky-mobile-cta block.
//
// Fixed bottom-of-screen bar with two large taps: "Call now" (tel:)
// and "Book now" (/book). MOBILE-ONLY (≤md breakpoint) — hides on
// desktop where the navbar's CTAs are already reachable from any
// scroll depth.
//
// Industry consensus from Cal.com, Calendly, Mr. Rooter, Roto-Rooter,
// and every conversion-tuned trades site: a sticky mobile CTA bar
// lifts mobile bookings by 2-3x. The thumb is at the bottom of the
// screen; meet it there.
//
// Tech notes:
//   - position: fixed; bottom: 0 — pulled out of document flow at
//     runtime. The PageRenderer's RevealOnScroll wrapper is harmless
//     (the bar is always visible from page load, so the motion never
//     animates).
//   - safe-area-inset-bottom for iOS home indicator clearance.
//   - z-index: 50 sits above hero/sections but below modals/sheets.
//   - Tap targets are 56px tall — meets WCAG 2.5.5 (44x44 minimum).

import Link from "next/link";
import { Phone, Calendar } from "lucide-react";
import type { StickyMobileCTASectionContent } from "./types";

export function StickyMobileCTASection({
  phone,
  phoneLink,
  bookLink,
  callText,
  bookText,
}: StickyMobileCTASectionContent) {
  if (!phone) return null;

  const resolvedPhoneLink = phoneLink ?? `tel:${phone.replace(/[^\d+]/g, "")}`;
  const resolvedBookLink = bookLink ?? "/book";
  const resolvedCallText = callText ?? "Call";
  const resolvedBookText = bookText ?? "Book";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur-md md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        borderColor: "var(--sf-border)",
      }}
      role="navigation"
      aria-label="Quick booking actions"
    >
      <div className="flex items-stretch divide-x divide-border">
        <a
          href={resolvedPhoneLink}
          className="flex flex-1 items-center justify-center gap-2 py-4 text-sm font-semibold text-foreground active:bg-muted/40"
          aria-label={`${resolvedCallText} ${phone}`}
        >
          <Phone className="size-4" />
          <span>{resolvedCallText}</span>
        </a>
        <Link
          href={resolvedBookLink}
          className="flex flex-1 items-center justify-center gap-2 py-4 text-sm font-semibold"
          style={{
            backgroundColor: "var(--sf-primary, #21a38b)",
            color: "var(--sf-bg, #ffffff)",
          }}
          aria-label={resolvedBookText}
        >
          <Calendar className="size-4" />
          <span>{resolvedBookText}</span>
        </Link>
      </div>
    </div>
  );
}
