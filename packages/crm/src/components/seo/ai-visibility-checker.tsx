"use client";

// The AI Visibility Checker — the interactive island of
// /tools/ai-visibility-checker. Two honest, fully client-side parts:
//   Part A — a self-assessment scorecard (no network, no LLM call) that grades
//            how "citable" a business is by generative engines (ChatGPT,
//            Google's AI Overviews, Perplexity) and returns a prioritized fix
//            list, each fix explaining WHY LLMs lean on that signal.
//   Part B — a prompt generator: given a business type + city, it hands the
//            user the exact prompts to paste into ChatGPT/Perplexity/Google AI
//            themselves. We never query any model — we give them the ruler.
// Styled on the MKT palette to match the other free-tool pages.

import { useState, type ReactElement } from "react";
import { copyToClipboard } from "./result-card";

const INK = "#221D17";
const GREEN = "#059669";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";
const RED = "#C0392B";

type Answer = "yes" | "no" | "unsure" | null;

type Question = {
  id: string;
  text: string;
  /** Relative weight — some signals move an LLM's citation more than others. */
  weight: number;
  /** Fix-it copy shown when the answer is "no" or "unsure": one line on WHY
   *  generative engines lean on this signal. */
  fixIt: string;
};

// Ordered roughly by how much each signal moves a generative engine. The
// scorecard is a self-assessment: the user reports these, we do not detect them.
const QUESTIONS: Question[] = [
  {
    id: "gbp",
    text: "Is your Google Business Profile claimed and fully filled out (categories, hours, services, photos)?",
    weight: 3,
    fixIt: "Assistants lean heavily on Google's local data for 'near me' and 'best in [city]' answers. A thin or unclaimed profile means the model has little verified fact to repeat about you.",
  },
  {
    id: "reviews",
    text: "Do you have 25+ reviews, with recent ones in the last 90 days?",
    weight: 3,
    fixIt: "Review count and freshness are the clearest public proxy for 'is this business real and active.' Models surface the places others vouch for, and stale review history reads as a dormant business.",
  },
  {
    id: "listicles",
    text: "Do you appear on third-party 'best {type} in {city}' listicles or directories?",
    weight: 3,
    fixIt: "Generative engines synthesize 'best of' answers largely from existing ranked lists. If no one else has put you on a list, the model has nothing to aggregate you into.",
  },
  {
    id: "nap",
    text: "Is your name, address, and phone number identical everywhere it appears online?",
    weight: 2,
    fixIt: "Conflicting contact details lower the model's confidence that listings refer to the same business, so it hedges or omits you rather than risk citing a wrong number.",
  },
  {
    id: "plaintext",
    text: "Does your site answer common customer questions in plain, readable text (not buried in images or PDFs)?",
    weight: 2,
    fixIt: "Models can only cite what they can parse. Answers locked inside images, video, or script-rendered widgets are invisible; a plain-text FAQ is quotable verbatim.",
  },
  {
    id: "schema",
    text: "Does your site use structured data / schema markup (LocalBusiness, FAQ, Service)?",
    weight: 2,
    fixIt: "Schema spells out your hours, location, and services as machine-readable facts, so the engine repeats them with confidence instead of guessing from prose.",
  },
  {
    id: "questions",
    text: "Have you published pages that directly answer the questions people ask (pricing, service area, 'how much does X cost')?",
    weight: 2,
    fixIt: "Assistants match a user's question to the page that answers it most plainly. If you never wrote the answer down, a competitor who did gets cited in your place.",
  },
  {
    id: "llmstxt",
    text: "Do you offer a clean machine-readable version of key pages (an llms.txt, or Markdown/plain-text copies)?",
    weight: 1,
    fixIt: "A clean text surface removes the parsing friction of a heavy site, giving crawlers an unambiguous, low-noise copy of your facts to quote — the same reason docs sites ship an llms.txt.",
  },
];

const MAX_SCORE = QUESTIONS.reduce((sum, q) => sum + q.weight, 0);

function letterGrade(pct: number): { letter: string; color: string; label: string } {
  if (pct >= 90) return { letter: "A", color: GREEN, label: "Highly citable" };
  if (pct >= 75) return { letter: "B", color: GREEN, label: "Mostly citable" };
  if (pct >= 55) return { letter: "C", color: AMBER, label: "Partly citable" };
  if (pct >= 35) return { letter: "D", color: AMBER, label: "Hard to cite" };
  return { letter: "F", color: RED, label: "Nearly invisible" };
}

type PromptTemplate = { label: string; build: (type: string, city: string) => string };

// The prompts we hand the user to run THEMSELVES. We never send these anywhere.
const PROMPT_TEMPLATES: PromptTemplate[] = [
  { label: "Best-of list", build: (t, c) => `What are the best ${t} in ${c}? List the top 5 with a one-line reason for each.` },
  { label: "Direct recommendation", build: (t, c) => `I need a ${t} in ${c}. Who should I call, and why would you recommend them?` },
  { label: "Comparison", build: (t, c) => `Compare the top-rated ${t} in ${c}. Which has the best reviews and reputation?` },
  { label: "Named check", build: (t, c) => `Is there a well-reviewed ${t} in ${c} you'd trust for a same-week appointment?` },
];

const AI_TOOLS = ["ChatGPT", "Perplexity", "Google AI Mode / AI Overviews"];

function CopyPromptRow({ text }: { text: string }): ReactElement {
  const [copied, setCopied] = useState(false);
  async function onCopy(): Promise<void> {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }
  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ flex: "1 1 240px", fontSize: 14, lineHeight: 1.5, color: INK }}>{text}</span>
      <button
        type="button"
        onClick={onCopy}
        style={{
          padding: "8px 16px",
          borderRadius: 10,
          border: `1.5px solid ${copied ? GREEN : INK10}`,
          background: copied ? "rgba(5, 150, 105,0.12)" : "#fff",
          color: copied ? GREEN : INK,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "Copied ✓" : "Copy prompt"}
      </button>
    </div>
  );
}

export function AiVisibilityChecker(): ReactElement {
  // ── Part A: scorecard state ──
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitted, setSubmitted] = useState(false);

  const answeredCount = QUESTIONS.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length;
  const earned = QUESTIONS.filter((q) => answers[q.id] === "yes").reduce((sum, q) => sum + q.weight, 0);
  const pct = Math.round((earned / MAX_SCORE) * 100);
  const grade = letterGrade(pct);
  // Prioritized: heaviest signals first, "no" ahead of "unsure".
  const gaps = QUESTIONS.filter((q) => answers[q.id] === "no" || answers[q.id] === "unsure").sort(
    (a, b) => b.weight - a.weight || (answers[a.id] === "no" ? -1 : 1) - (answers[b.id] === "no" ? -1 : 1),
  );

  function setAnswer(id: string, value: Answer): void {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  // ── Part B: prompt generator state ──
  const [bizType, setBizType] = useState("");
  const [city, setCity] = useState("");
  const type = bizType.trim() || "plumbers";
  const place = city.trim() || "Austin, TX";

  return (
    <div style={{ display: "grid", gap: 28 }}>
      {/* ── PART A: Visibility scorecard ── */}
      <section style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GREEN }}>Part A</div>
          <h2 style={{ margin: "6px 0 4px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Visibility scorecard</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "rgba(34,29,23,0.65)" }}>
            A self-assessment of the signals generative engines use to decide who to cite. Answer honestly — this scores
            what you tell it; it does not scan your website.
          </p>
        </div>

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
                        background: active ? "rgba(5, 150, 105,0.12)" : "#fff",
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
            Grade my AI visibility ({answeredCount}/{QUESTIONS.length} answered)
          </button>
        </div>

        {submitted && (
          <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div
                aria-hidden="true"
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 18,
                  border: `2.5px solid ${grade.color}`,
                  background: `${grade.color}1A`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 40,
                  fontWeight: 900,
                  color: grade.color,
                }}
              >
                {grade.letter}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>
                  AI visibility score
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, color: grade.color, lineHeight: 1.1 }}>
                  {pct}/100 · {grade.label}
                </div>
              </div>
            </div>

            {gaps.length > 0 ? (
              <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(34,29,23,0.65)" }}>
                  Fix these first — highest-impact signals at the top:
                </div>
                {gaps.map((g, idx) => (
                  <div key={g.id} style={{ border: `1px solid ${INK10}`, borderRadius: 12, padding: "12px 16px", background: "rgba(255,255,255,0.7)" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                      {idx + 1}. {g.text}
                    </div>
                    <div style={{ fontSize: 13.5, color: "rgba(34,29,23,0.68)", lineHeight: 1.5 }}>{g.fixIt}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ marginTop: 14, fontSize: 14.5, color: "rgba(34,29,23,0.7)" }}>
                Strong — you cover the signals generative engines look for. Now run the prompts in Part B to see it live.
              </p>
            )}

            <p style={{ margin: "20px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
              How this works: this is a self-assessment scorecard, not a live audit. We did not query ChatGPT, Google, or
              Perplexity and we did not scan the web or your site — the grade reflects only the answers you selected. To
              see your real visibility, run the prompts in Part B yourself.
            </p>
          </div>
        )}
      </section>

      {/* ── PART B: Test it yourself ── */}
      <section style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GREEN }}>Part B</div>
          <h2 style={{ margin: "6px 0 4px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Test it yourself</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "rgba(34,29,23,0.65)" }}>
            Enter your business type and city. We generate the exact prompts — you paste them into{" "}
            {AI_TOOLS.join(", ")} and see whether your business comes up. We hand you the questions; we never run them for
            you.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <label style={{ flex: "1 1 200px", display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(34,29,23,0.6)" }}>Business type</span>
            <input
              type="text"
              value={bizType}
              onChange={(e) => setBizType(e.target.value)}
              placeholder="plumbers"
              style={{ padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${INK10}`, fontSize: 15, color: INK, background: "#fff" }}
            />
          </label>
          <label style={{ flex: "1 1 200px", display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(34,29,23,0.6)" }}>City</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Austin, TX"
              style={{ padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${INK10}`, fontSize: 15, color: INK, background: "#fff" }}
            />
          </label>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {PROMPT_TEMPLATES.map((tpl) => (
            <div key={tpl.label}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.5)", marginBottom: 5 }}>
                {tpl.label}
              </div>
              <CopyPromptRow text={tpl.build(type, place)} />
            </div>
          ))}
        </div>

        <p style={{ margin: "18px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
          Honest by design: these prompts run on your device, in your own AI account. SeldonFrame does not call any AI
          model here and makes no claim about what the answer will say — try them and see for yourself.
        </p>
      </section>

      {/* ── Bridge / CTA ── */}
      <section style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(5, 150, 105,0.06)", padding: "26px 28px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Want AI to actually recommend you?
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)", maxWidth: 620 }}>
          SeldonFrame makes a business citable: structured, honest content generative engines can parse, a clean{" "}
          <strong>.md / llms.txt</strong> surface for the facts about you, and the listicle presence that best-of answers
          are built from. No tricks — just the signals models trust.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
            Get your business cited — start free
          </a>
          <a
            href="https://app.seldonframe.com/book/seldonframes-workspace-7798/default"
            style={{ background: "#fff", color: INK, padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none", border: `1.5px solid ${INK10}` }}
          >
            Book a demo call
          </a>
        </div>
      </section>
    </div>
  );
}
