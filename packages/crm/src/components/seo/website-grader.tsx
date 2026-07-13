"use client";

// The Website Grader — the interactive island of /tools/website-grader.
// A visitor pastes their business site URL; we POST it to
// /api/tools/website-grader, which fetches it server-side (through the SSRF
// guard) and grades it with lib/seo/website-grader-checks.ts. This component
// only renders states: idle -> analyzing -> graded | error. No grading logic
// lives here — that's all server-side and unit-tested.

import { useState, type FormEvent, type ReactElement } from "react";
import { heroSubmitTarget } from "@/components/landing/hero-submit-target";

const INK = "#221D17";
const GREEN = "#059669";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";
const RED = "#C0392B";

type CheckStatus = "pass" | "warn" | "fail";

type CheckResult = {
  id: string;
  label: string;
  status: CheckStatus;
  why: string;
  fix: string;
  points: number;
  weight: number;
};

type GradeResponse = {
  url: string;
  score: number;
  grade: string;
  checks: CheckResult[];
};

type ViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "graded"; result: GradeResponse };

function statusIcon(status: CheckStatus): string {
  if (status === "pass") return "✓"; // ✓
  if (status === "warn") return "⚠"; // ⚠
  return "✗"; // ✗
}

function statusColor(status: CheckStatus): string {
  if (status === "pass") return GREEN;
  if (status === "warn") return AMBER;
  return RED;
}

function gradeColor(grade: string): string {
  if (grade === "A" || grade === "B") return GREEN;
  if (grade === "C" || grade === "D") return AMBER;
  return RED;
}

export function WebsiteGrader({ ungatedBuildEnabled }: { ungatedBuildEnabled: boolean }): ReactElement {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ViewState>({ kind: "idle" });

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setState({ kind: "error", message: "Enter a website URL first." });
      return;
    }

    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/tools/website-grader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<GradeResponse> & { error?: string };
      if (!res.ok || !data || typeof data.score !== "number") {
        setState({
          kind: "error",
          message: data?.error || "Something went wrong grading that site. Try again.",
        });
        return;
      }
      setState({
        kind: "graded",
        result: {
          url: data.url ?? trimmed,
          score: data.score,
          grade: data.grade ?? "F",
          checks: data.checks ?? [],
        },
      });
    } catch {
      setState({
        kind: "error",
        message: "Something went wrong reaching our grader. Check your connection and try again.",
      });
    }
  }

  function reset(): void {
    setUrl("");
    setState({ kind: "idle" });
  }

  const showForm = state.kind === "idle" || state.kind === "loading" || state.kind === "error";

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {showForm && (
        <section style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
          <form onSubmit={onSubmit} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourbusiness.com"
              disabled={state.kind === "loading"}
              style={{
                flex: "1 1 320px",
                padding: "14px 16px",
                borderRadius: 12,
                border: `1.5px solid ${INK10}`,
                fontSize: 16,
                color: INK,
                background: "#fff",
              }}
            />
            <button
              type="submit"
              disabled={state.kind === "loading"}
              style={{
                background: state.kind === "loading" ? "rgba(34,29,23,0.35)" : INK,
                color: "#F6F2EA",
                border: "none",
                padding: "14px 28px",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15.5,
                cursor: state.kind === "loading" ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {state.kind === "loading" ? "Grading…" : "Grade my site"}
            </button>
          </form>

          {state.kind === "error" && (
            <p role="alert" style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.5, color: RED }}>
              {state.message}
            </p>
          )}

          <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
            We fetch the page server-side, check it against 10 signals that win or lose local jobs, and grade it. We
            don't store the URL or the page content — this runs fresh every time.
          </p>
        </section>
      )}

      {state.kind === "graded" && (
        <>
          <section style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div
                aria-hidden="true"
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 20,
                  border: `2.5px solid ${gradeColor(state.result.grade)}`,
                  background: `${gradeColor(state.result.grade)}1A`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 44,
                  fontWeight: 900,
                  color: gradeColor(state.result.grade),
                }}
              >
                {state.result.grade}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>
                  Website score
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: gradeColor(state.result.grade), lineHeight: 1.1 }}>
                  {state.result.score}/100
                </div>
                <div style={{ fontSize: 13.5, color: "rgba(34,29,23,0.6)", marginTop: 4, wordBreak: "break-all" }}>{state.result.url}</div>
              </div>
              <button
                type="button"
                onClick={reset}
                style={{
                  marginLeft: "auto",
                  background: "#fff",
                  color: INK,
                  border: `1.5px solid ${INK10}`,
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                Grade another site
              </button>
            </div>

            <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
              {state.result.checks.map((c) => (
                <div key={c.id} style={{ border: `1px solid ${INK10}`, borderRadius: 12, padding: "14px 16px", background: "rgba(255,255,255,0.7)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span aria-hidden="true" style={{ color: statusColor(c.status), fontWeight: 900, fontSize: 16 }}>
                      {statusIcon(c.status)}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 14.5 }}>{c.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "rgba(34,29,23,0.5)" }}>
                      {c.points}/{c.weight} pts
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13.5, color: "rgba(34,29,23,0.68)", lineHeight: 1.5 }}>
                    <strong style={{ color: "rgba(34,29,23,0.8)" }}>Why it matters: </strong>
                    {c.why}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13.5, color: "rgba(34,29,23,0.68)", lineHeight: 1.5 }}>
                    <strong style={{ color: "rgba(34,29,23,0.8)" }}>{c.status === "pass" ? "Status: " : "How to fix: "}</strong>
                    {c.fix}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Bridge / CTA ── */}
          <section style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(5, 150, 105,0.06)", padding: "26px 28px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
              {state.result.score < 80 ? "Scored under 80?" : "Solid score — want it built even better?"}
            </h2>
            <p style={{ margin: "0 0 18px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)", maxWidth: 620 }}>
              SeldonFrame builds you a site that passes all 10 checks — click-to-call, online booking, a lead form,
              schema markup, and a fast mobile-first layout — in about 3 minutes.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <a
                href={heroSubmitTarget("url", state.result.url, ungatedBuildEnabled)}
                style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}
              >
                Rebuild my site free
              </a>
              <button
                type="button"
                onClick={reset}
                style={{ background: "#fff", color: INK, padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, border: `1.5px solid ${INK10}`, cursor: "pointer" }}
              >
                Grade another site
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
