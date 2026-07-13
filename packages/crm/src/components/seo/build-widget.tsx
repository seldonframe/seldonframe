"use client";

// The inline "see it built for YOUR business" widget on the SEO comparison /
// alternative / best-of pages — the highest-intent conversion seam: the reader
// pastes their website and lands in the SAME build flow as the homepage hero
// (heroSubmitTarget: /try?url= when SF_WEB_UNGATED_BUILD is on, else
// /signup?intent=build&url=). Pure reuse — no new build path, no network here.
//
// The server template passes `ungatedBuildEnabled` (read via
// isWebUngatedBuildOn(process.env) server-side; this island never reads env).

import { useState, type ReactElement, type CSSProperties } from "react";
import { heroSubmitTarget } from "@/components/landing/hero-submit-target";

const INK = "#221D17";
const GREEN = "#059669";
const PAPER = "#F6F2EA";

/** Loosely normalize what people paste: bare domains get https://. */
export function normalizeSiteInput(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function BuildWidget({
  ungatedBuildEnabled,
  heading = "See it built for YOUR business",
}: {
  ungatedBuildEnabled: boolean;
  heading?: string;
}): ReactElement {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const url = normalizeSiteInput(value);
    if (!url) {
      setError("Paste your website address — like yourbusiness.com");
      return;
    }
    window.location.href = heroSubmitTarget("url", url, ungatedBuildEnabled);
  };

  return (
    <section
      aria-label="Build your own workspace"
      style={{
        marginTop: 36,
        border: `2px solid ${GREEN}`,
        borderRadius: 20,
        padding: "26px 26px",
        background: "rgba(5, 150, 105,0.06)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: INK }}>{heading}</h2>
      <p style={{ margin: "8px 0 14px", fontSize: 14.5, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 620 }}>
        Don't take the table's word for it. Paste your website and get <strong>your own</strong> site, booking calendar,
        CRM and AI receptionist built in about <strong>3 minutes</strong> — free, before you ever sign up.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
      >
        <label htmlFor="sf-build-url" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Your website address
        </label>
        <input
          id="sf-build-url"
          type="text"
          inputMode="url"
          placeholder="yourbusiness.com"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          style={{
            flex: "1 1 240px",
            minWidth: 200,
            padding: "13px 16px",
            borderRadius: 12,
            border: error ? "1.5px solid #C0392B" : "1.5px solid rgba(34,29,23,0.2)",
            fontSize: 15.5,
            background: "#fff",
            color: INK,
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            background: INK,
            color: PAPER,
            padding: "13px 24px",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15.5,
            border: "none",
            cursor: "pointer",
          }}
        >
          Build mine free →
        </button>
      </form>
      {error ? (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 13.5, color: "#C0392B" }}>
          {error}
        </p>
      ) : (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.5)" }}>
          No card. No call. Your data exports as JSON if you leave.
        </p>
      )}
    </section>
  );
}
