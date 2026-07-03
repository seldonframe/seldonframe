// GET /api/og/shipped — the deploy share-card OG image (virality pack, Task
// 2). Renders a dark "shipped in N minutes" card via `ImageResponse` (built
// into Next 16's `next/og` — no new dependency). Linked from
// buildShareCard's `cardUrl` (src/lib/build/share-card.ts) and embedded as
// the og:image on the share text a builder posts publicly.
//
// SECURITY: every query param below is ATTACKER-CONTROLLED — this is a
// public, unauthenticated GET route, and `name` in particular is meant to be
// shared/pasted around the internet. Inputs are sanitized defensively even
// though buildShareCard (the only first-party caller) already produces
// well-formed values, because nothing stops a third party from hitting this
// route directly with an arbitrary query string:
//   - `name` is length-capped (~48 chars) and rendered ONLY as JSX text
//     content (never interpolated into a `style` value or any prop that
//     accepts a URL) — ImageResponse has no HTML/script execution surface,
//     but capping length still bounds the rendered card's layout and the
//     amount of untrusted text baked into the output image.
//   - `mins` is parsed as an integer and clamped to [1, 120] — the exact
//     same bounds buildShareCard itself enforces — so a malformed or
//     out-of-range value can't produce a nonsensical or absurdly long card.
//   - `kind` is validated against the fixed union; anything else falls back
//     to the generic "agent" wording.
// No user input ever reaches a style object, an href/src, or any
// interpolation site other than plain text nodes.

// Runtime: every other route in this codebase runs `nodejs` (no existing
// `edge` route to match), and `ImageResponse` (next/og, backed by
// @vercel/og) works fine there — edge isn't required for this to render
// correctly, just an option. Staying on nodejs keeps this route consistent
// with the rest of the app's routes and avoids introducing the first
// edge-runtime deploy config this codebase has never exercised.
export const runtime = "nodejs";

import { ImageResponse } from "next/og";

const MAX_NAME_LENGTH = 48;
const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

const VALID_KINDS = new Set(["voice", "chat", "workspace"]);

function sanitizeName(raw: string | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "a business";
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

function sanitizeMinutes(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, parsed));
}

function sanitizeKind(raw: string | null): string {
  return raw && VALID_KINDS.has(raw) ? raw : "chat";
}

function nounForKind(kind: string): string {
  return kind === "voice" ? "phone receptionist" : "agent";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const name = sanitizeName(searchParams.get("name"));
  const mins = sanitizeMinutes(searchParams.get("mins"));
  const kind = sanitizeKind(searchParams.get("kind"));
  const noun = nounForKind(kind);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0a0a0f",
          padding: "64px",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 28,
            fontWeight: 600,
            color: "#8b5cf6",
            letterSpacing: -0.5,
          }}
        >
          {"⚡ SeldonFrame"}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.15,
            }}
          >
            {`${name} · shipped in ${mins} min`}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#a1a1aa",
            }}
          >
            {`A 24/7 AI ${noun}, built from an IDE.`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "#71717a",
          }}
        >
          {"seldonframe.com/build"}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
