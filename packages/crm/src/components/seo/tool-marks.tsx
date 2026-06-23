// "Works with" brand marks for the programmatic agent pages (Task B).
//
// Each agent's `tools: ToolRef[]` (lib/seo/agent-pages.ts) names the integrations
// it touches by a stable `mark` key; this module turns each key into a clean,
// recognizable inline SVG brand glyph rendered inside a labeled chip. Inline SVG
// (not <img>) so there is NO network fetch, NO broken-image risk, and it renders
// identically on the server (RSC) — these are static SEO pages.
//
// Marks we have a faithful brand glyph for: Google "G", Google Business Profile,
// Google Calendar, Gmail, Facebook "f". The generic capability marks (SMS, phone,
// website, CRM, Postiz) use a tasteful line/solid icon — never a placeholder.
//
// Pure presentational — no "use client". Safe from server components.

import type { ReactElement } from "react";
import { MKT } from "@/components/marketplace/marketplace-data";
import type { ToolMark, ToolRef } from "@/lib/seo/agent-pages";

const GLYPH_BOX = 18;

/** Google's four-color "G". The canonical brand mark. */
function GoogleG(): ReactElement {
  return (
    <svg width={GLYPH_BOX} height={GLYPH_BOX} viewBox="0 0 48 48" aria-hidden style={{ display: "block", flex: "none" }}>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 3.99 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/** Google Business Profile — the teal storefront pin. Recognizable as the GBP
 *  app mark (a location pin enclosing a shop), in Google's place-teal. */
function GoogleBusiness(): ReactElement {
  return (
    <svg width={GLYPH_BOX} height={GLYPH_BOX} viewBox="0 0 24 24" aria-hidden style={{ display: "block", flex: "none" }}>
      <path fill="#1A73E8" d="M12 2c-4.42 0-8 3.4-8 7.6 0 5.25 8 12.4 8 12.4s8-7.15 8-12.4C20 5.4 16.42 2 12 2z" />
      <path fill="#fff" d="M8 8h8v1.2H8zM8.7 10.1h6.6v3.9a.6.6 0 0 1-.6.6H9.3a.6.6 0 0 1-.6-.6z" />
      <path fill="#1A73E8" d="M9.9 11.1h1.5v1.8H9.9zm2.7 0h1.5v1.8h-1.5z" />
    </svg>
  );
}

/** Google Calendar — the multi-color squared "31" sheet. */
function GoogleCalendar(): ReactElement {
  return (
    <svg width={GLYPH_BOX} height={GLYPH_BOX} viewBox="0 0 24 24" aria-hidden style={{ display: "block", flex: "none" }}>
      <rect x="4" y="4" width="16" height="16" rx="2.4" fill="#fff" stroke="#DADCE0" strokeWidth="1" />
      <path d="M4 7.2A2.4 2.4 0 0 1 6.4 4.8h11.2A2.4 2.4 0 0 1 20 7.2V8H4z" fill="#4285F4" opacity="0.12" />
      <path d="M7.6 3.4v3M16.4 3.4v3" stroke="#5F6368" strokeWidth="1.4" strokeLinecap="round" />
      <text x="12" y="16.2" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="7.2" fontWeight="700" fill="#1A73E8">
        31
      </text>
    </svg>
  );
}

/** Gmail — the white envelope with the red "M" valley (the brand mark). */
function Gmail(): ReactElement {
  return (
    <svg width={GLYPH_BOX} height={GLYPH_BOX} viewBox="0 0 24 24" aria-hidden style={{ display: "block", flex: "none" }}>
      {/* envelope body */}
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.6" fill="#fff" stroke="#DADCE0" strokeWidth="0.8" />
      {/* left + right rails (Gmail red) */}
      <path d="M3.5 7.1c0-.88.71-1.6 1.6-1.6h.4v13h-2z" fill="#EA4335" />
      <path d="M20.5 7.1c0-.88-.71-1.6-1.6-1.6h-.4v13h2z" fill="#EA4335" />
      {/* the red "M" valley */}
      <path d="M5.5 6 12 11l6.5-5v2.2L12 13.2 5.5 8.2z" fill="#EA4335" />
    </svg>
  );
}

/** Facebook — the brand "f" in a blue rounded square. */
function Facebook(): ReactElement {
  return (
    <svg width={GLYPH_BOX} height={GLYPH_BOX} viewBox="0 0 24 24" aria-hidden style={{ display: "block", flex: "none" }}>
      <rect width="24" height="24" rx="5" fill="#1877F2" />
      <path
        fill="#fff"
        d="M15.4 12.6h-2v6.4h-2.7v-6.4H9.3v-2.3h1.4V8.9c0-1.85 1.1-2.9 2.78-2.9.8 0 1.5.06 1.7.09v2h-1.17c-.92 0-1.1.44-1.1 1.08v1.13h2.2z"
      />
    </svg>
  );
}

/** A neutral line glyph (paper-ink) for the generic capability marks, so a
 *  capability chip still carries a tasteful icon rather than a broken image. */
function LineGlyph({ paths }: { paths: ReactElement }): ReactElement {
  return (
    <svg
      width={GLYPH_BOX}
      height={GLYPH_BOX}
      viewBox="0 0 24 24"
      fill="none"
      stroke={MKT.green}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block", flex: "none" }}
    >
      {paths}
    </svg>
  );
}

const SmsMark = () => (
  <LineGlyph paths={<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />} />
);
const PhoneMark = () => (
  <LineGlyph paths={<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />} />
);
const WebsiteMark = () => (
  <LineGlyph
    paths={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
      </>
    }
  />
);
const CrmMark = () => (
  <LineGlyph
    paths={
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    }
  />
);
const PostizMark = () => (
  <LineGlyph
    paths={
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.59 13.51 15.42 17.49M15.41 6.51 8.59 10.49" />
      </>
    }
  />
);

const MARK_GLYPH: Record<ToolMark, () => ReactElement> = {
  google: GoogleG,
  "google-business": GoogleBusiness,
  "google-calendar": GoogleCalendar,
  gmail: Gmail,
  sms: SmsMark,
  phone: PhoneMark,
  facebook: Facebook,
  website: WebsiteMark,
  crm: CrmMark,
  postiz: PostizMark,
};

/** A single "Works with" chip: the brand glyph + the tool name. */
export function ToolChip({ tool }: { tool: ToolRef }): ReactElement {
  const Glyph = MARK_GLYPH[tool.mark];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        fontSize: 14,
        fontWeight: 600,
        color: MKT.ink,
        background: "#fff",
        border: "1px solid rgba(34,29,23,0.12)",
        padding: "8px 14px 8px 10px",
        borderRadius: 999,
        boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 8,
          background: "rgba(34,29,23,0.04)",
          flex: "none",
        }}
      >
        <Glyph />
      </span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tool.name}</span>
    </span>
  );
}

/** The full "Works with" row — wraps responsively (`.sf-ap-works` in the page's
 *  scoped CSS handles flex-wrap + gap). */
export function ToolLogoRow({ tools }: { tools: ToolRef[] }): ReactElement {
  return (
    <div className="sf-ap-works">
      {tools.map((t) => (
        <ToolChip key={`${t.mark}:${t.name}`} tool={t} />
      ))}
    </div>
  );
}
