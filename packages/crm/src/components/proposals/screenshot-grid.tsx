// packages/crm/src/components/proposals/screenshot-grid.tsx
// 2026-05-19 — Proposal Builder. Shows the rest of the stack as
// thumbnails alongside the live booking iframe. Uses the existing
// marketing screenshots from /marketing/. Spec: §"Live workspace preview".

import Image from "next/image";

const SCREENSHOTS = [
  { src: "/marketing/crm-pipeline.png", label: "CRM + Pipeline" },
  { src: "/marketing/form.png", label: "Intake form" },
  { src: "/marketing/agents.png", label: "AI chatbot + automations" },
  { src: "/marketing/booking-page.png", label: "Booking page" },
];

export function ScreenshotGrid() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {SCREENSHOTS.map((shot) => (
        <figure
          key={shot.src}
          className="rounded-2xl border border-border/70 overflow-hidden bg-card"
        >
          <div className="aspect-[4/3] relative bg-muted/40">
            <Image src={shot.src} alt={shot.label} fill className="object-cover" />
          </div>
          <figcaption className="px-4 py-2 text-xs text-muted-foreground border-t border-border/50">
            {shot.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
