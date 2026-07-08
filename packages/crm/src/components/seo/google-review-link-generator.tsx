"use client";

// The Google review link generator — the interactive island of
// /tools/google-review-link-generator. Pure client-side string building, no
// network calls except the third-party QR image (loaded via <img>, not fetched
// by us). Styled on the MKT palette to match the other free-tool pages.

import { useMemo, useState, type ReactElement } from "react";

const INK = "#221D17";
const GREEN = "#00897B";
const INK10 = "rgba(34,29,23,0.10)";
const RED = "#C0392B";

/** Best-effort extraction of a `place_id` query param from a pasted Google
 *  Maps URL. Returns null if the input isn't a URL or has no place_id. */
function extractPlaceIdFromUrl(input: string): string | null {
  try {
    const url = new URL(input);
    const fromQuery = url.searchParams.get("place_id") || url.searchParams.get("placeid");
    if (fromQuery) return fromQuery;
    // Some share links embed it as ...!1s<place_id>... inside the path — not
    // reliable enough to parse; we only trust the explicit query param.
    return null;
  } catch {
    return null;
  }
}

function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

const STEPS: { emoji: string; label: string }[] = [
  { emoji: "1️⃣", label: "Make your link (10 seconds)" },
  { emoji: "2️⃣", label: "Print the QR code" },
  { emoji: "3️⃣", label: "Customers scan it and leave a ⭐⭐⭐⭐⭐" },
];

function StepStrip(): ReactElement {
  return (
    <div
      role="img"
      aria-label="Three steps: make your link in ten seconds, print the QR code, customers scan it and leave a five-star review."
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 24 }}
    >
      {STEPS.map((s, i) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: `1px solid ${INK10}`,
              borderRadius: 12,
              padding: "10px 14px",
              background: "#fff",
              fontSize: 13.5,
              fontWeight: 700,
              color: INK,
            }}
          >
            <span style={{ fontSize: 16 }}>{s.emoji}</span>
            <span>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <span aria-hidden="true" style={{ color: GREEN, fontWeight: 800, fontSize: 16 }}>
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function GoogleReviewLinkGenerator(): ReactElement {
  const [input, setInput] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  const { placeId, error } = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return { placeId: null as string | null, error: null as string | null };

    if (looksLikeUrl(trimmed)) {
      const extracted = extractPlaceIdFromUrl(trimmed);
      if (extracted) return { placeId: extracted, error: null };
      return {
        placeId: null,
        error: "That URL doesn't include a place_id query param. Paste your Place ID directly instead (see the helper below).",
      };
    }

    if (/\s/.test(trimmed)) {
      return { placeId: null, error: "A Place ID shouldn't contain spaces. Double-check what you pasted." };
    }

    return { placeId: trimmed, error: null };
  }, [input]);

  const reviewLink = placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : null;
  const qrSrc = reviewLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(reviewLink)}`
    : null;

  async function copyLink(): Promise<void> {
    if (!reviewLink) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(reviewLink);
      } else {
        throw new Error("no clipboard api");
      }
    } catch {
      // Fallback: select-and-copy via a hidden textarea.
      const el = document.createElement("textarea");
      el.value = reviewLink;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore — user can still select the text field manually
      }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <StepStrip />

      <label style={{ display: "block" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Google Place ID or Maps URL</span>
        <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.55)", margin: "2px 0 10px" }}>
          Paste your business's Place ID, or a Google Maps URL that contains a <code>place_id</code> parameter.
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
          aria-label="Google Place ID or Maps URL"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: `1.5px solid ${INK10}`,
            fontSize: 15,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      </label>

      <button
        type="button"
        onClick={() => setShowHelp((v) => !v)}
        style={{
          marginTop: 12,
          background: "none",
          border: "none",
          padding: 0,
          color: GREEN,
          fontWeight: 700,
          fontSize: 13.5,
          cursor: "pointer",
          textDecoration: "underline",
        }}
        aria-expanded={showHelp}
      >
        {showHelp ? "Hide" : "How do I find my Place ID?"}
      </button>
      {showHelp && (
        <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)", background: "rgba(0,137,123,0.06)", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ margin: "0 0 8px" }}>
            Use Google's free{" "}
            <a
              href="https://developers.google.com/maps/documentation/places/web-service/place-id"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: GREEN, fontWeight: 700 }}
            >
              Place ID Finder
            </a>
            : search for your business by name and address, and it shows the Place ID directly under the map — copy that
            string and paste it above.
          </p>
          <p style={{ margin: 0 }}>
            Alternatively, open your business on Google Maps, click "Share," copy the link, and paste the full URL above —
            we'll try to pull the ID out of it automatically (this only works if the URL contains a{" "}
            <code>place_id</code> parameter).
          </p>
        </div>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 16, color: RED, fontWeight: 600, fontSize: 14 }}>
          {error}
        </p>
      )}

      {reviewLink && (
        <div style={{ marginTop: 24, borderTop: `1px solid ${INK10}`, paddingTop: 24, display: "grid", gap: 20, gridTemplateColumns: "1fr", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 8 }}>
              Your review link
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                border: `1px solid ${INK10}`,
                borderRadius: 12,
                padding: "12px 14px",
                background: "#fff",
              }}
            >
              <code style={{ flex: "1 1 260px", fontSize: 13.5, wordBreak: "break-all", color: INK }}>{reviewLink}</code>
              <button
                type="button"
                onClick={copyLink}
                style={{
                  background: copied ? GREEN : INK,
                  color: "#F6F2EA",
                  border: "none",
                  padding: "9px 18px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 8 }}>
                QR code
              </div>
              {qrSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrSrc}
                  alt="QR code that opens your Google review link"
                  width={160}
                  height={160}
                  style={{ borderRadius: 12, border: `1px solid ${INK10}`, background: "#fff", padding: 8 }}
                />
              )}
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5, maxWidth: 420 }}>
                QR code generated by a free third-party service (api.qrserver.com) — nothing is sent to SeldonFrame. Print it
                on a receipt, table tent, or invoice so customers can scan-and-review on the spot.
              </p>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 26 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Build your AI front office free in ~3 minutes
        </a>
      </div>
    </div>
  );
}
