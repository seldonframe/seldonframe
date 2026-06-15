"use client";

/**
 * Avatar — initials chip with a deterministic neutral tint, or a photo.
 * Square-rounded geometry to match the product's calm aesthetic.
 */

function hashTint(name: string) {
  const palette = [
    { bg: "#eaf0f7", fg: "#3f5572" },
    { bg: "#efeafa", fg: "#5b4a86" },
    { bg: "#eafaf2", fg: "#2f6b4f" },
    { bg: "#faf0ea", fg: "#8a5a3c" },
    { bg: "#f7eaf2", fg: "#834e6c" },
    { bg: "#eaf6fa", fg: "#3a6678" },
  ];
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) {
    h = ((h * 31 + name.charCodeAt(i)) >>> 0);
  }
  return palette[h % palette.length];
}

function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name = "",
  src,
  size = 40,
  round = false,
  style = {},
}: {
  name?: string;
  src?: string;
  size?: number;
  round?: boolean;
  style?: React.CSSProperties;
}) {
  const tint = hashTint(name);
  const radius = round ? "50%" : "var(--radius-md)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius,
        background: src ? "var(--gray-100)" : tint.bg,
        color: tint.fg,
        fontSize: Math.round(size * 0.36),
        fontWeight: "var(--weight-bold)" as React.CSSProperties["fontWeight"],
        letterSpacing: "-0.01em",
        overflow: "hidden",
        ...style,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
