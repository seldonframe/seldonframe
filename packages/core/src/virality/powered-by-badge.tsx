// Powered-by attribution badge for free-tier customer surfaces.
//
// SLICE 9 PR 2 C1: renders the SeldonFrame wordmark per brand
// guidelines. Per the brand README's "Theme bridge isolation" rule,
// this badge ALWAYS uses SeldonFrame brand colors regardless of the
// surrounding workspace/customer/vertical theme — SeldonFrame
// attribution is SeldonFrame's identity, not the customer's brand.
//
// Variant: light surfaces use the green wordmark; dark surfaces use
// the white variant via the `variant` prop. No other recoloring is
// permitted.
//
// The surrounding workspace's theme MUST NOT cascade into this
// component (no inherited color, no theme-aware className tokens).
// The label remains rendered as plain text inside the link for
// screen-reader continuity.

export function PoweredByBadge({
  href = "https://seldonframe.com",
  label = "Powered by SeldonFrame",
  removeBranding = false,
  variant = "light",
}: {
  href?: string;
  label?: string;
  removeBranding?: boolean;
  variant?: "light" | "dark";
}) {
  if (removeBranding) {
    return null;
  }

  const wordmark =
    variant === "dark"
      ? "/brand/seldonframe-wordmark-white.svg"
      : "/brand/seldonframe-wordmark.svg";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium opacity-80 transition-opacity hover:opacity-100"
    >
      <span className="text-[hsl(var(--color-text-secondary))]">Powered by</span>
      {/* Plain <img> not next/image — package is framework-agnostic. */}
      {/* Pre-launch polish: bumped from h-3.5 (14px) to h-5 (20px) — */}
      {/* the original size was barely legible at footer scale. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wordmark} alt="SeldonFrame" height={20} className="h-5 w-auto" />
    </a>
  );
}
