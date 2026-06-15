"use client";

export function Skeleton({
  width = "100%",
  height = 14,
  radius = "var(--radius-sm)",
  circle = false,
  style = {},
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  circle?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="sf-skeleton"
      style={{
        display: "block",
        width,
        height: circle ? width : height,
        borderRadius: circle ? "50%" : radius,
        ...style,
      }}
    />
  );
}
