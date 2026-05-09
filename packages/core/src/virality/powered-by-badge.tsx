// Powered-by attribution badge for free-tier customer surfaces.
//
// SLICE 9 PR 2 C1: renders the SeldonFrame mark + wordmark per brand
// guidelines. Per the brand README's "Theme bridge isolation" rule,
// this badge ALWAYS uses SeldonFrame brand colors regardless of the
// surrounding workspace/customer/vertical theme — SeldonFrame
// attribution is SeldonFrame's identity, not the customer's brand.
//
// v1.40.1 — REWRITE. Pre-1.40.1 the badge loaded a single SVG file
// (seldonframe-wordmark.svg) whose text was rendered via SVG <text>
// with a serif font fallback chain. When the user's browser didn't
// have the first-choice font ('Instrument Serif'), the fallback
// rendered slightly wider than the SVG's viewBox (320 units), which
// CLIPPED the wordmark mid-letter. Customers' footers showed
// "Powered by SeldonFra" with the rest of the wordmark cut off.
//
// New approach: render the geometric MARK as inline SVG (no text
// inside the SVG, no font dependency, can never clip), and render
// the WORDMARK as plain HTML text alongside it. This gives us:
//   1. No font-fallback clipping ever
//   2. Faster paint (no SVG file fetch over the network)
//   3. Wordmark inherits the page's font, looking native to the
//      surface but still clearly "Powered by SeldonFrame" because
//      the geometric mark is unmistakably ours
//   4. Trivially styleable variants (light vs dark)

const SF_BRAND_COLOR = "#1FAE85";

function SeldonFrameMark({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      stroke={SF_BRAND_COLOR}
      strokeWidth="6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      {/* The 4 frame edges with their characteristic open-right notch */}
      <line x1="22" y1="22" x2="58" y2="22" />
      <line x1="78" y1="42" x2="78" y2="78" />
      <line x1="78" y1="78" x2="22" y2="78" />
      <line x1="22" y1="78" x2="22" y2="22" />
      {/* The 4 corner dots — top-right is hollow per brand identity */}
      <circle cx="22" cy="22" r="6" fill={SF_BRAND_COLOR} stroke="none" />
      <circle cx="78" cy="22" r="6" fill="none" />
      <circle cx="78" cy="78" r="6" fill={SF_BRAND_COLOR} stroke="none" />
      <circle cx="22" cy="78" r="6" fill={SF_BRAND_COLOR} stroke="none" />
    </svg>
  );
}

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

  const labelColor =
    variant === "dark" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)";
  const wordmarkColor = variant === "dark" ? "#ffffff" : "#0a0a0a";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium opacity-80 transition-opacity hover:opacity-100"
      style={{ color: labelColor }}
    >
      <span style={{ color: labelColor }}>Powered by</span>
      <span className="flex items-center gap-1.5">
        <SeldonFrameMark className="h-4 w-4 shrink-0" />
        <span
          className="text-sm font-semibold tracking-tight"
          style={{ color: wordmarkColor, letterSpacing: "-0.01em" }}
        >
          SeldonFrame
        </span>
      </span>
    </a>
  );
}
