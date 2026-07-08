"use client";

// A zero-dependency "lite" YouTube embed for the /best listicle pages — the
// video seam (best-pages.ts's optional videoId). Server-renders a plain
// thumbnail <img> + play-button overlay; no YouTube JS (iframe API, ads
// script) ever loads until the reader actually clicks. On click, swaps in a
// real privacy-enhanced (youtube-nocookie.com) iframe with autoplay.
//
// This is a client component only because it needs the click-to-swap state —
// the initial render (thumbnail + play button) is identical to what a plain
// server component would output, so it costs nothing extra on first paint.

import { useState, type ReactElement } from "react";
import { MKT } from "@/components/marketplace/marketplace-data";

export function LiteYoutube({ videoId, title }: { videoId: string; title: string }): ReactElement {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 16,
          overflow: "hidden",
          border: `1px solid ${MKT.ink10}`,
          margin: "22px 0",
        }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: "16 / 9",
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${MKT.ink10}`,
        margin: "22px 0",
        padding: 0,
        cursor: "pointer",
        background: "#000",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail is a remote YouTube asset, not a local/optimizable image */}
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt={title}
        loading="lazy"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            width: 68,
            height: 48,
            borderRadius: 12,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
