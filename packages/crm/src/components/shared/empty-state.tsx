import Link from "next/link";

export function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="crm-card mx-auto max-w-[420px] p-10 text-center">
      <svg viewBox="0 0 120 120" aria-hidden="true" className="mx-auto mb-7 h-[128px] w-[128px] text-primary">
        <circle cx="60" cy="60" r="42" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <path d="M34 72h52M38 60h44M45 48h30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="86" cy="38" r="6" fill="currentColor" fillOpacity="0.8" />
      </svg>
      <h3 className="text-[20px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-[hsl(var(--color-text-secondary))]">{description}</p>
      <Link href={ctaHref} className="crm-button-primary mt-5 inline-flex h-10 px-4">
        {ctaLabel}
      </Link>
    </div>
  );
}
