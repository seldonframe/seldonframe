"use client";

// The A2P 10DLC compliance checker — the interactive island of
// /tools/a2p-10dlc-checker. Pure client-side scoring quiz, no network calls.
// Styled on the MKT palette to match the other free-tool pages.

import { useState, type ReactElement } from "react";

const INK = "#221D17";
const GREEN = "#1F2B24";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";
const RED = "#C0392B";

type Answer = "yes" | "no" | "unsure" | null;

type Question = {
  id: string;
  text: string;
  /** Fix-it copy shown when the answer is "no" or "unsure". */
  fixIt: string;
};

const QUESTIONS: Question[] = [
  {
    id: "local10dlc",
    text: "Are you texting from a regular 10-digit local number (10DLC), not a toll-free or short code?",
    fixIt: "10DLC registration only applies to standard local numbers. If you're on toll-free, you need toll-free verification instead — a different process.",
  },
  {
    id: "brand",
    text: "Have you registered your Brand with The Campaign Registry (usually done through your provider, e.g. Twilio)?",
    fixIt: "Brand registration identifies your business to carriers. Unregistered brands get little to no throughput and messages are frequently filtered or blocked.",
  },
  {
    id: "campaign",
    text: "Have you registered a Campaign (use-case) under that Brand?",
    fixIt: "A Campaign tells carriers what kind of messages you send (e.g. appointment reminders, customer care). Sending without an approved campaign is treated as unregistered traffic.",
  },
  {
    id: "ein",
    text: "Is your business registered with an EIN (not a sole proprietorship)?",
    fixIt: "Sole proprietor registrations exist but carry low throughput limits and stricter use-case restrictions. An EIN-registered business gets materially better deliverability.",
  },
  {
    id: "optin",
    text: "Do you collect and keep documented opt-in before texting a customer?",
    fixIt: "Carriers and the registry require proof of consent. Without documented opt-in, you're exposed to complaints, filtering, and potential TCPA liability.",
  },
  {
    id: "optinLanguage",
    text: "Does your opt-in language name your business, state message frequency, mention 'msg & data rates may apply', and explain STOP/HELP?",
    fixIt: "Campaign approval and ongoing compliance depend on this exact language. Missing disclosures is one of the most common reasons campaigns get flagged or rejected.",
  },
  {
    id: "stopHelp",
    text: "Do you honor STOP instantly (no further texts) and respond to HELP?",
    fixIt: "Failing to honor STOP is a compliance violation that can get your campaign suspended and exposes you to legal risk. HELP responses are required by carrier rules.",
  },
  {
    id: "prohibitedContent",
    text: "Do you avoid prohibited content (cannabis, firearms, gambling, adult content, debt collection, and other SHAFT/high-risk categories)?",
    fixIt: "Certain content categories are banned or require special high-risk campaign registration. Sending them under a standard campaign risks a hard block.",
  },
  {
    id: "monitoring",
    text: "Do you monitor your trust score / throughput limits with your provider?",
    fixIt: "Throughput is capped based on your trust score. Not monitoring it means you may be silently rate-limited without knowing why messages aren't landing.",
  },
];

function scoreLabel(score: number, total: number): { label: string; color: string } {
  const pct = score / total;
  if (pct >= 0.89) return { label: "Ready", color: GREEN };
  if (pct >= 0.55) return { label: "At risk", color: AMBER };
  return { label: "Not compliant", color: RED };
}

/** The 4 stations of the "road to compliant texting", each mapped to the
 *  question ids that determine its color. A station is green only if every
 *  mapped question is answered "yes"; red if any mapped question is
 *  answered "no"; amber for "unsure" or a mix; neutral if unanswered. */
const STATIONS: { emoji: string; label: string; questionIds: string[] }[] = [
  { emoji: "🏢", label: "Register your business (Brand)", questionIds: ["brand", "ein"] },
  { emoji: "📋", label: "Register what you send (Campaign)", questionIds: ["local10dlc", "campaign", "prohibitedContent", "monitoring"] },
  { emoji: "✍️", label: "Get permission first (Opt-in)", questionIds: ["optin", "optinLanguage"] },
  { emoji: "🛑", label: "Honor STOP & HELP", questionIds: ["stopHelp"] },
];

const NEUTRAL = "rgba(34,29,23,0.25)";

function stationColor(questionIds: string[], answers: Record<string, Answer>): string {
  const answered = questionIds.filter((id) => answers[id] !== undefined && answers[id] !== null);
  if (answered.length === 0) return NEUTRAL;
  if (answered.length < questionIds.length) return AMBER; // partially answered — treat as at-risk
  if (answered.some((id) => answers[id] === "no")) return RED;
  if (answered.some((id) => answers[id] === "unsure")) return AMBER;
  return GREEN;
}

function Ladder({ answers }: { answers: Record<string, Answer> }): ReactElement {
  const colors = STATIONS.map((s) => stationColor(s.questionIds, answers));
  return (
    <div
      role="img"
      aria-label={`Road to compliant texting: ${STATIONS.map((s, i) => `${s.label} — ${colors[i] === GREEN ? "good" : colors[i] === RED ? "needs work" : colors[i] === AMBER ? "at risk" : "not answered"}`).join("; ")}.`}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 8, marginBottom: 24 }}
    >
      {STATIONS.map((s, i) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              border: `2px solid ${colors[i]}`,
              borderRadius: 12,
              padding: "10px 14px",
              background: colors[i] === NEUTRAL ? "#fff" : `${colors[i]}1A`,
              minWidth: 150,
            }}
          >
            <span style={{ fontSize: 18 }}>{s.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.3 }}>{s.label}</span>
          </div>
          {i < STATIONS.length - 1 && (
            <span aria-hidden="true" style={{ color: "rgba(34,29,23,0.35)", fontWeight: 800, fontSize: 16 }}>
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function A2p10dlcChecker(): ReactElement {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitted, setSubmitted] = useState(false);

  const answeredCount = QUESTIONS.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length;
  const score = QUESTIONS.filter((q) => answers[q.id] === "yes").length;
  const gaps = QUESTIONS.filter((q) => answers[q.id] === "no" || answers[q.id] === "unsure");
  const result = scoreLabel(score, QUESTIONS.length);

  function setAnswer(id: string, value: Answer): void {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 20 }}>
        {QUESTIONS.map((q, i) => (
          <fieldset key={q.id} style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4, padding: 0 }}>
              {i + 1}. {q.text}
            </legend>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {(["yes", "no", "unsure"] as const).map((opt) => {
                const active = answers[q.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAnswer(q.id, opt)}
                    aria-pressed={active}
                    style={{
                      padding: "8px 18px",
                      borderRadius: 10,
                      border: `1.5px solid ${active ? GREEN : INK10}`,
                      background: active ? "rgba(31, 43, 36,0.12)" : "#fff",
                      color: active ? GREEN : INK,
                      fontWeight: 700,
                      fontSize: 13.5,
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 26 }}>
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          disabled={answeredCount < QUESTIONS.length}
          style={{
            background: answeredCount < QUESTIONS.length ? "rgba(34,29,23,0.25)" : INK,
            color: "#F6F2EA",
            border: "none",
            padding: "13px 26px",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15.5,
            cursor: answeredCount < QUESTIONS.length ? "not-allowed" : "pointer",
          }}
        >
          See my results ({answeredCount}/{QUESTIONS.length} answered)
        </button>
      </div>

      {submitted && (
        <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
          <Ladder answers={answers} />

          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>
              Readiness
            </span>
            <span style={{ fontSize: 26, fontWeight: 800, color: result.color }}>{result.label}</span>
            <span style={{ fontSize: 14, color: "rgba(34,29,23,0.55)" }}>
              {score}/{QUESTIONS.length} passed
            </span>
          </div>

          {gaps.length > 0 ? (
            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(34,29,23,0.65)" }}>Fix these to improve deliverability:</div>
              {gaps.map((g) => (
                <div key={g.id} style={{ border: `1px solid ${INK10}`, borderRadius: 12, padding: "12px 16px", background: "rgba(255,255,255,0.7)" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{g.text}</div>
                  <div style={{ fontSize: 13.5, color: "rgba(34,29,23,0.68)", lineHeight: 1.5 }}>{g.fixIt}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ marginTop: 14, fontSize: 14.5, color: "rgba(34,29,23,0.7)" }}>
              Nice work — your setup covers the fundamentals carriers look for.
            </p>
          )}

          <p style={{ margin: "20px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
            This is educational information, not legal advice. 10DLC requirements evolve — always check your provider's
            current documentation (e.g. Twilio) before registering a Brand or Campaign.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Build your AI front office free in ~3 minutes
        </a>
      </div>
    </div>
  );
}
