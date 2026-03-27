export function PoweredByBadge({
  href = "https://seldonframe.com",
  label = "Powered by SeldonFrame",
  removeBranding = false,
}: {
  href?: string;
  label?: string;
  removeBranding?: boolean;
}) {
  if (removeBranding) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-3 py-1 text-[11px] font-medium text-[hsl(var(--color-text-secondary))] transition-colors hover:text-foreground"
    >
      {label}
    </a>
  );
}
