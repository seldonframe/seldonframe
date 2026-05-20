// packages/crm/src/components/proposals/booking-iframe.tsx
// 2026-05-19 — Proposal Builder. Embeds the preview workspace's booking
// page so the prospect can click through a LIVE working booking flow
// inside the proposal. Spec: §"Live workspace preview in the proposal".

export function BookingIframe({
  workspaceSlug,
  baseDomain,
}: {
  workspaceSlug: string;
  baseDomain: string;
}) {
  const src = `https://${workspaceSlug}.${baseDomain}/book`;
  return (
    <div className="rounded-2xl border border-border/70 overflow-hidden bg-card">
      <div className="px-4 py-2 border-b border-border/50 bg-muted/40 text-xs text-muted-foreground">
        Live preview · click around — this is your actual booking page
      </div>
      <iframe
        src={src}
        title="Booking page preview"
        className="w-full h-[640px] border-0"
        loading="lazy"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </div>
  );
}
