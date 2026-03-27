import { PoweredByBadge } from "./powered-by-badge";

export function EmbeddableWidget({
  title,
  iframeSrc,
  removeBranding = false,
}: {
  title?: string;
  iframeSrc: string;
  removeBranding?: boolean;
}) {
  return (
    <section className="space-y-2">
      {title ? <p className="text-card-title">{title}</p> : null}
      <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <iframe src={iframeSrc} title={title ?? "Embeddable widget"} className="h-[640px] w-full" loading="lazy" />
      </div>
      <PoweredByBadge removeBranding={removeBranding} />
    </section>
  );
}
