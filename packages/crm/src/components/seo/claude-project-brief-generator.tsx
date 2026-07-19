"use client";

// The Claude Project Brief Generator — the interactive island of
// /tools/claude-project-brief-generator. Pure client-side string assembly
// (no LLM call, no network): fill the form → get a ready-to-paste Project
// instructions block (the ROLE / WHAT / HOW / ASSUME / NEVER standing-brief
// shape) + the knowledge-doc checklist → copy button → the SF CTA.

import { useMemo, useState, type ReactElement, type CSSProperties } from "react";

const INK = "#221D17";
const GREEN = "#1F2B24";
const INK10 = "rgba(34,29,23,0.10)";
const INK55 = "rgba(34,29,23,0.55)";

type Fields = {
  role: string;
  business: string;
  audience: string;
  tasks: string;
  tone: string;
  format: string;
  assume: string;
  never: string;
};

const DEFAULTS: Fields = {
  role: "senior marketing copywriter",
  business: "a residential HVAC company serving the Austin metro",
  audience: "homeowners aged 30–65 who need repairs fast and distrust pushy sales language",
  tasks: "write service-page copy; draft Google Business posts; answer review responses",
  tone: "plain, confident, zero hype — short sentences, no exclamation marks",
  format: "markdown with H2 sections; keep drafts under 300 words unless asked",
  assume: "we charge trip fees that are credited against repairs; we never quote firm prices before diagnosis; we're licensed and insured",
  never: "never invent prices, certifications or reviews; never use the words 'unleash', 'elevate' or 'game-changer'; never promise same-day service",
};

function buildBrief(f: Fields): string {
  const lines = [
    "ROLE",
    `You are a ${f.role.trim() || "[role]"} working for ${f.business.trim() || "[business]"}. You are writing for ${f.audience.trim() || "[audience]"} — assume they know nothing about the business yet.`,
    "",
    "WHAT THIS PROJECT IS FOR",
    `The main tasks here are: ${f.tasks.trim() || "[task 1; task 2; task 3]"}. Assume every request relates to one of these unless told otherwise.`,
    "",
    "HOW TO RESPOND",
    `Tone: ${f.tone.trim() || "[tone]"}. Format: ${f.format.trim() || "[format]"}.`,
    "Do not ask clarifying questions unless genuinely blocked. Make a reasonable assumption, state it in one line, and proceed.",
    "",
    "WHAT TO ASSUME",
    `${f.assume.trim() || "[domain facts to treat as given in every response]"}`,
    "",
    "NEVER",
    `${f.never.trim() || "[the hard rules: banned claims, banned words, banned formats]"}`,
  ];
  return lines.join("\n");
}

const KNOWLEDGE_CHECKLIST = [
  "A voice & style guide (1–3 pages: sentence rhythm, banned words, the feel of the output)",
  "An audience document (who they are, what they already know, what they're skeptical of)",
  "A scope/pillars document (the topics this project covers, so Claude stays in lane)",
  "3–5 of the actual best past pieces (voice is caught, not taught)",
  "Any domain reference the work needs (specs, constraints, SEO notes)",
];

export function ClaudeProjectBriefGenerator(): ReactElement {
  const [fields, setFields] = useState<Fields>(DEFAULTS);
  const [copied, setCopied] = useState(false);
  const brief = useMemo(() => buildBrief(fields), [fields]);

  function set<K extends keyof Fields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "26px 26px" }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Field label="The role Claude plays" hint="e.g. senior marketing copywriter, technical writer" value={fields.role} onChange={(v) => set("role", v)} />
        <Field label="The business" hint="who the project is about — one line" value={fields.business} onChange={(v) => set("business", v)} />
        <Field label="The audience" hint="who the output is FOR — they know nothing yet" value={fields.audience} onChange={(v) => set("audience", v)} />
        <Field label="The 2–3 main tasks" hint="separate with semicolons" value={fields.tasks} onChange={(v) => set("tasks", v)} />
        <Field label="Tone" hint="specific — 'plain, confident, zero hype'" value={fields.tone} onChange={(v) => set("tone", v)} />
        <Field label="Format rules" hint="structure + length preferences" value={fields.format} onChange={(v) => set("format", v)} />
        <Field label="Facts to assume" hint="domain truths every response should treat as given" value={fields.assume} onChange={(v) => set("assume", v)} textarea />
        <Field label="The NEVER list" hint="hard rules — banned claims, words, formats" value={fields.never} onChange={(v) => set("never", v)} textarea />
      </div>

      <div style={{ marginTop: 24, borderTop: `1px solid ${INK10}`, paddingTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Your Project instructions — paste into Claude</h3>
          <button
            type="button"
            onClick={copy}
            style={{ background: INK, color: "#F6F2EA", padding: "9px 18px", borderRadius: 10, fontWeight: 700, fontSize: 13.5, border: "none", cursor: "pointer" }}
          >
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </button>
        </div>
        <pre
          style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, background: "#fff", border: `1px solid ${INK10}`, borderRadius: 12, padding: "16px 18px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: INK }}
        >
          {brief}
        </pre>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>Then build the knowledge base (tight beats big)</h3>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {KNOWLEDGE_CHECKLIST.map((item) => (
            <li key={item} style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)", marginBottom: 6 }}>
              <span style={{ color: GREEN, fontWeight: 800, marginRight: 8 }}>□</span>
              {item}
            </li>
          ))}
        </ul>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: INK55, lineHeight: 1.55 }}>
          Final step the guides all agree on: open a conversation and test that Claude can actually retrieve each document before you trust it.
        </p>
      </div>

      <div style={{ marginTop: 24, border: `1px solid rgba(31, 43, 36,0.35)`, background: "rgba(31, 43, 36,0.05)", borderRadius: 14, padding: "18px 20px" }}>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.8)" }}>
          <strong>Doing this once is a good afternoon. Doing it per client, forever, is a job.</strong> SeldonFrame builds and
          maintains this automatically for every client — the standing brief, the grounded knowledge, the retrieval tests —
          plus the website, CRM, booking calendar and AI receptionist the brief can only describe.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
          <a href="/#hero-form" style={{ background: INK, color: "#F6F2EA", padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14.5, textDecoration: "none" }}>
            Build it free in 3 minutes
          </a>
          <a
            href="https://app.seldonframe.com/book/seldonframes-workspace-7798/default"
            style={{ border: `1.5px solid ${INK10}`, color: INK, padding: "11px 22px", borderRadius: 12, fontWeight: 700, fontSize: 14.5, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
          >
            Book a demo call
          </a>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  textarea,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}): ReactElement {
  const shared: CSSProperties = {
    width: "100%",
    border: `1px solid ${INK10}`,
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    color: INK,
    background: "#fff",
  };
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
      <span style={{ display: "block", fontSize: 12, color: INK55, margin: "2px 0 6px" }}>{hint}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...shared, resize: "vertical" }} aria-label={label} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={shared} aria-label={label} />
      )}
    </label>
  );
}
