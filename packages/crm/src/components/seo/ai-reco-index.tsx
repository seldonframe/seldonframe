"use client";

// The AI Recommendation Index leaderboard island — filter by engine +
// category, light inline SVG bars (no chart deps), per-brand rows expand to
// show which questions the brand appeared in + at what rank. Pure
// client-side filter/sort over the static registry in
// lib/seo/ai-reco-index-data.ts; no fetches, no external state.

import { useMemo, useState } from "react";
import {
  BRANDS,
  CATEGORY_LABELS,
  ENGINES_SHIPPED,
  QUESTION_BY_ID,
  buildLeaderboard,
  type Category,
} from "@/lib/seo/ai-reco-index-data";

const CATEGORY_OPTIONS: Array<{ value: Category | "all"; label: string }> = [
  { value: "all", label: "All categories" },
  { value: "crm", label: CATEGORY_LABELS.crm },
  { value: "booking", label: CATEGORY_LABELS.booking },
  { value: "voice-ai", label: CATEGORY_LABELS["voice-ai"] },
  { value: "all-in-one", label: CATEGORY_LABELS["all-in-one"] },
];

const WRAP: React.CSSProperties = { maxWidth: 760, margin: "0 auto" };

const FILTER_ROW: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 20,
};

const SELECT: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(34,29,23,0.18)",
  fontSize: 14,
  background: "white",
};

const ROW: React.CSSProperties = {
  border: "1px solid rgba(34,29,23,0.12)",
  borderRadius: 12,
  padding: "14px 16px",
  marginBottom: 10,
  cursor: "pointer",
};

const BAR_TRACK: React.CSSProperties = {
  width: "100%",
  height: 10,
  borderRadius: 6,
  background: "rgba(34,29,23,0.08)",
  marginTop: 8,
  overflow: "hidden",
};

export function AiRecoIndexLeaderboard() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [engine] = useState<"claude">("claude"); // v1 ships one engine; select kept for the follow-up column
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(
    () => buildLeaderboard(category === "all" ? undefined : category),
    [category],
  );
  const maxScore = rows.length > 0 ? rows[0].score : 1;

  return (
    <div style={WRAP}>
      <div style={FILTER_ROW}>
        <label style={{ fontSize: 13, color: "rgba(34,29,23,0.6)" }}>
          Category{" "}
          <select
            style={SELECT}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "all")}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13, color: "rgba(34,29,23,0.6)" }}>
          Engine{" "}
          <select style={SELECT} value={engine} disabled>
            <option value="claude">Claude (v1 — the only engine that shipped)</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 14, color: "rgba(34,29,23,0.6)" }}>
          No brands appeared for this category in the current snapshot.
        </p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((row, i) => {
            const isOpen = expanded === row.brand;
            const barPct = Math.max(4, Math.round((row.score / maxScore) * 100));
            return (
              <li
                key={row.brand}
                style={ROW}
                onClick={() => setExpanded(isOpen ? null : row.brand)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpanded(isOpen ? null : row.brand);
                  }
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>
                    #{i + 1} {row.brand}
                    {row.brand === "SeldonFrame" ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          fontWeight: 500,
                          color: "rgba(34,29,23,0.55)",
                        }}
                      >
                        (that&rsquo;s us)
                      </span>
                    ) : null}
                  </span>
                  <span style={{ fontSize: 13, color: "rgba(34,29,23,0.55)" }}>
                    {row.score} pts &middot; {row.questionCount} question{row.questionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <svg width="100%" height="10" style={BAR_TRACK} aria-hidden="true">
                  <rect x="0" y="0" width={`${barPct}%`} height="10" fill="rgba(34,29,23,0.78)" rx="6" />
                </svg>
                {isOpen ? (
                  <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 13.5, color: "rgba(34,29,23,0.72)" }}>
                    {row.appearances.map((a) => (
                      <li key={`${a.questionId}-${a.engine}`}>
                        Rank #{a.rank} for &ldquo;{QUESTION_BY_ID[a.questionId]?.text}&rdquo; ({a.engine})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <p style={{ marginTop: 16, fontSize: 12, color: "rgba(34,29,23,0.5)" }}>
        {ENGINES_SHIPPED.length === 1
          ? "v1 measures one engine (Claude). Google AI Overviews is the next column — see the methodology below."
          : null}
      </p>
    </div>
  );
}

// Re-exported so the FAQ/page copy and tests can reference the same source
// of truth without importing the raw data module directly everywhere.
export const ALL_BRAND_NAMES = BRANDS.map((b) => b.name);
