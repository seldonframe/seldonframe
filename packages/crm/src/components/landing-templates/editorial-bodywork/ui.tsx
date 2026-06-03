"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Photo } from "./theme";

export function ThemedPlaceholder({
  role = "image", label, decorative = false, className = "", style,
}: { role?: string; label?: string; decorative?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div className={"sf4-ph " + className} data-role={role} style={style} role="img" aria-label={label || role + " placeholder"}>
      {!decorative && <span className="sf4-ph-tag">{label || role}</span>}
    </div>
  );
}

export function SmartImage({
  photo, role, label, decorative, className = "", style,
}: { photo?: Photo | null; role?: string; label?: string; decorative?: boolean; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (!photo || !photo.url || failed) {
    return <ThemedPlaceholder role={role} label={label} decorative={decorative} className={className} style={style} />;
  }
  return (
    <img className={"sf4-img " + className} style={style} src={photo.url} alt={photo.alt || label || ""} loading="lazy" decoding="async" onError={() => setFailed(true)} />
  );
}
