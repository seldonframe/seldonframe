"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Photo } from "./theme";

// Themed color-field placeholder â€” the real fallback whenever a photo is
// missing OR fails to load. Driven entirely by --sf-* vars, so it always
// looks intentional (never a broken <img>). Decorative backgrounds hide the tag.
export function ThemedPlaceholder({
  role = "image",
  label,
  decorative = false,
  className = "",
  style,
}: {
  role?: string;
  label?: string;
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={"sf5-ph " + className} data-role={role} style={style} role="img" aria-label={label || role + " placeholder"}>
      {!decorative && <span className="sf5-ph-tag">{label || role}</span>}
    </div>
  );
}

// Real <img> with graceful fallback to the themed placeholder on error.
export function SmartImage({
  photo,
  role,
  label,
  decorative,
  className = "",
  style,
}: {
  photo?: Photo | null;
  role?: string;
  label?: string;
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (!photo || !photo.url || failed) {
    return <ThemedPlaceholder role={role} label={label} decorative={decorative} className={className} style={style} />;
  }
  return (
    <img
      className={"sf5-img " + className}
      style={style}
      src={photo.url}
      alt={photo.alt || label || ""}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
