"use client";

// The Booking Friction Grader — the interactive island of
// /tools/booking-friction-grader. Pure client-side scorecard, no network
// calls: a short questionnaire → friction score + letter grade + a
// prioritized list of the specific frictions the answers revealed, each with
// a one-line fix. Styled on the MKT palette to match the other free-tool pages.

import { useState, type ReactElement } from "react";

const INK = "#221D17";
const GREEN = "#1F2B24";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";
const RED = "#C0392B";

type Option = { label: string; friction: number };

type Question = {
  id: string;
  text: string;
  hint: string;
  options: Option[];
  /** Name of the specific friction this question surfaces (shown when the
   *  chosen answer scores any friction). */
  frictionLabel: string;
  /** One-line fix shown alongside the friction. */
  fix: string;
};

// Each option carries a friction weight (0 = frictionless). The higher the
// weight, the more bookings that answer tends to leak. Weights are summed and
// normalized to a 0–100 friction score — see scoreFriction().
const QUESTIONS: Question[] = [
  {
    id: "selfServe",
    text: "Can a customer book online by themselves, without calling or messaging you first?",
    hint: "A public booking link or scheduler they can complete on their own",
    options: [
      { label: "Yes — they book online themselves", friction: 0 },
      { label: "Only by calling or messaging us", friction: 25 },
    ],
    frictionLabel: "No self-serve online booking",
    fix: "Put a public one-tap booking link everywhere — website, Google, social bio — so people book at 11pm without you.",
  },
  {
    id: "afterHours",
    text: "If someone tries to reach you after hours, do they get an immediate response?",
    hint: "Most booking intent happens evenings and weekends",
    options: [
      { label: "Yes — instant reply or booking, 24/7", friction: 0 },
      { label: "They hear back the next business day", friction: 12 },
      { label: "No — voicemail or nothing until we open", friction: 20 },
    ],
    frictionLabel: "No after-hours response",
    fix: "Let AI answer and book after hours so evening and weekend interest turns into appointments instead of missed calls.",
  },
  {
    id: "instant",
    text: "When a customer books, do they get instant confirmation the slot is theirs?",
    hint: "Confirmed on the spot vs. 'we'll get back to you to confirm'",
    options: [
      { label: "Yes — confirmed instantly", friction: 0 },
      { label: "No — we confirm manually later", friction: 15 },
    ],
    frictionLabel: "No instant confirmation",
    fix: "Use real-time availability so the slot is locked the moment they pick it — no 'pending' limbo that lets them drift.",
  },
  {
    id: "callback",
    text: "Does booking require a call back or an email exchange to actually lock it in?",
    hint: "Any back-and-forth after they first reach out",
    options: [
      { label: "No — booking completes in one go", friction: 0 },
      { label: "Yes — we have to call or email to confirm", friction: 15 },
    ],
    frictionLabel: "Booking needs a manual back-and-forth",
    fix: "Remove the confirmation phone-tag — let them self-book a real slot in one uninterrupted flow.",
  },
  {
    id: "steps",
    text: "How many steps does it take to go from 'I want to book' to 'booked'?",
    hint: "Count the taps, screens, and form fields",
    options: [
      { label: "1–2 taps", friction: 0 },
      { label: "3–5 steps", friction: 8 },
      { label: "A long form or 6+ steps", friction: 16 },
    ],
    frictionLabel: "Too many steps to book",
    fix: "Cut the flow to the essentials — every extra field or screen loses a share of people before they finish.",
  },
  {
    id: "mobile",
    text: "Is your booking flow effortless to complete on a phone?",
    hint: "Most customers are booking one-handed on mobile",
    options: [
      { label: "Yes — effortless on mobile", friction: 0 },
      { label: "It works, but it's clunky", friction: 8 },
      { label: "No — it's hard or broken on phones", friction: 15 },
    ],
    frictionLabel: "Not mobile-friendly",
    fix: "Make the booking flow thumb-friendly and fast on a phone — that's where most of your customers actually are.",
  },
  {
    id: "reminders",
    text: "Do you automatically send booking confirmations AND reminders?",
    hint: "Reminders are what cut no-shows",
    options: [
      { label: "Yes — confirmation and reminders, automatic", friction: 0 },
      { label: "Confirmation only, no reminders", friction: 6 },
      { label: "Neither is automatic", friction: 12 },
    ],
    frictionLabel: "No automatic confirmations and reminders",
    fix: "Turn on automatic confirmations plus reminders so booked customers actually show up.",
  },
  {
    id: "leadCapture",
    text: "If someone starts to book but doesn't finish, do you capture their info to follow up?",
    hint: "The half-finished bookings you never see",
    options: [
      { label: "Yes — we capture and follow up", friction: 0 },
      { label: "No — if they don't finish, they're gone", friction: 12 },
    ],
    frictionLabel: "Abandoned bookings aren't captured",
    fix: "Capture the lead as soon as they start so a quick follow-up can win back the ones who drop off.",
  },
];

// Highest friction any set of answers could produce — used to normalize the
// raw friction total onto a 0–100 scale.
const MAX_FRICTION = QUESTIONS.reduce((sum, q) => sum + Math.max(...q.options.map((o) => o.friction)), 0);

/** Higher score = more friction = more lost bookings. 0 is frictionless. */
function grade(score: number): { letter: string; label: string; color: string } {
  if (score <= 12) return { letter: "A", label: "Nearly frictionless", color: GREEN };
  if (score <= 28) return { letter: "B", label: "Low friction", color: GREEN };
  if (score <= 48) return { letter: "C", label: "Moderate friction", color: AMBER };
  if (score <= 70) return { letter: "D", label: "High friction", color: RED };
  return { letter: "F", label: "Severe friction", color: RED };
}

/** RED for the heavy leaks, AMBER for the lighter ones. */
function severityColor(friction: number): string {
  return friction >= 15 ? RED : AMBER;
}

export function BookingFrictionGrader(): ReactElement {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const answeredCount = QUESTIONS.filter((q) => answers[q.id] !== undefined).length;
  const allAnswered = answeredCount === QUESTIONS.length;

  const rawFriction = QUESTIONS.reduce((sum, q) => {
    const idx = answers[q.id];
    return idx === undefined ? sum : sum + q.options[idx].friction;
  }, 0);
  const score = Math.round((rawFriction / MAX_FRICTION) * 100);
  const result = grade(score);

  // The specific frictions the answers revealed, worst first.
  const frictions = QUESTIONS.filter((q) => {
    const idx = answers[q.id];
    return idx !== undefined && q.options[idx].friction > 0;
  })
    .map((q) => ({ q, friction: q.options[answers[q.id]].friction }))
    .sort((a, b) => b.friction - a.friction);

  function setAnswer(id: string, idx: number): void {
    setAnswers((prev) => ({ ...prev, [id]: idx }));
  }

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        {QUESTIONS.map((q, i) => (
          <fieldset key={q.id} style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4, padding: 0 }}>
              {i + 1}. {q.text}
            </legend>
            <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.55)", margin: "2px 0 10px" }}>{q.hint}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {q.options.map((opt, oi) => {
                const active = answers[q.id] === oi;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setAnswer(q.id, oi)}
                    aria-pressed={active}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 10,
                      border: `1.5px solid ${active ? GREEN : INK10}`,
                      background: active ? "rgba(31, 43, 36,0.12)" : "#fff",
                      color: active ? GREEN : INK,
                      fontWeight: 700,
                      fontSize: 13.5,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {opt.label}
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
          disabled={!allAnswered}
          style={{
            background: allAnswered ? INK : "rgba(34,29,23,0.25)",
            color: "#F6F2EA",
            border: "none",
            padding: "13px 26px",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15.5,
            cursor: allAnswered ? "pointer" : "not-allowed",
          }}
        >
          Grade my booking flow ({answeredCount}/{QUESTIONS.length} answered)
        </button>
      </div>

      {submitted && (
        <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                border: `2px solid ${result.color}`,
                background: `${result.color}1A`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                fontWeight: 800,
                color: result.color,
                flex: "0 0 auto",
              }}
            >
              {result.letter}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>
                Friction score
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: result.color }}>{score}/100</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: result.color }}>{result.label}</span>
              </div>
              <div style={{ fontSize: 13, color: "rgba(34,29,23,0.55)" }}>Higher friction means more customers give up before they book.</div>
            </div>
          </div>

          {/* Friction meter — 0 (frictionless) to 100 (severe). */}
          <div
            role="img"
            aria-label={`Friction meter: ${score} out of 100, grade ${result.letter}, ${result.label}.`}
            style={{ marginTop: 20, height: 16, borderRadius: 8, background: "rgba(34,29,23,0.06)", overflow: "hidden" }}
          >
            <div style={{ height: "100%", width: `${Math.max(4, score)}%`, background: result.color, borderRadius: 8, transition: "width 0.2s ease" }} />
          </div>

          {frictions.length > 0 ? (
            <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(34,29,23,0.65)" }}>
                Your biggest booking leaks, worst first:
              </div>
              {frictions.map(({ q, friction }, i) => (
                <div key={q.id} style={{ border: `1px solid ${INK10}`, borderLeft: `4px solid ${severityColor(friction)}`, borderRadius: 12, padding: "12px 16px", background: "rgba(255,255,255,0.7)" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                    {i + 1}. {q.frictionLabel}
                  </div>
                  <div style={{ fontSize: 13.5, color: "rgba(34,29,23,0.68)", lineHeight: 1.5 }}>{q.fix}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ marginTop: 16, fontSize: 14.5, color: "rgba(34,29,23,0.7)" }}>
              Impressive — your answers show a booking flow with almost nothing standing between a customer and a booked appointment.
            </p>
          )}

          <p style={{ margin: "20px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
            This grade is a heuristic self-assessment based only on your answers — it hasn't inspected your real website or
            booking system, so treat it as a prompt for where to look, not a measurement of your actual flow.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Make booking one tap — start free
        </a>
        <a
          href="https://app.seldonframe.com/book/seldonframes-workspace-7798/default"
          style={{ border: `1.5px solid ${INK10}`, color: INK, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
        >
          Book a demo call
        </a>
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 13.5, fontWeight: 700, color: GREEN }}>
        SeldonFrame gives you a one-tap booking link plus AI that answers and books after hours — so the leaks above stop
        costing you appointments.
      </p>
    </div>
  );
}
