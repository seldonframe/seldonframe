"use client";

// The Google review response generator — the interactive island of
// /tools/review-response-generator. Pure client-side template composition, no
// AI, no network calls, no signup. Styled on the MKT palette to match the
// other free-tool pages.

import { useMemo, useState, type ReactElement } from "react";

const INK = "#221D17";
const GREEN = "#1F2B24";
const INK10 = "rgba(34,29,23,0.10)";

type Scenario = "great" | "price" | "timing" | "quality" | "mixed" | "fake";
type Tone = "professional" | "warm" | "brief";

const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "great", label: "Great service (positive review)" },
  { id: "price", label: "Complaint about price" },
  { id: "timing", label: "Complaint about timing / no-show" },
  { id: "quality", label: "Complaint about quality" },
  { id: "mixed", label: "Mixed experience" },
  { id: "fake", label: "Fake or mistaken review" },
];

const TONES: { id: Tone; label: string }[] = [
  { id: "professional", label: "Professional" },
  { id: "warm", label: "Warm" },
  { id: "brief", label: "Brief" },
];

/** Template variants keyed by [rating-band]:[scenario]:[tone]. Each key has 3
 *  hand-written variants; `{business}` and `{name}` are interpolated. All
 *  1-2 star responses apologize without admitting fault, move the
 *  conversation offline, and never argue. */
type TemplateKey = `${"high" | "low" | "mixed"}:${Scenario}:${Tone}`;

const TEMPLATES: Record<string, string[]> = {
  "high:great:professional": [
    "Thank you {name} for the kind words — we're glad our team could take care of you at {business}. We look forward to seeing you again.",
    "We appreciate you taking the time to share this, {name}. Feedback like this means a lot to the team at {business}, and we'll be here whenever you need us.",
    "Thank you for the review, {name}. It's great to hear the experience met your expectations — {business} looks forward to working with you again.",
  ],
  "high:great:warm": [
    "{name}, this made our day! Thank you so much for choosing {business} — we can't wait to see you again. 🙂",
    "Wow, thank you {name}! Reviews like this are exactly why we love what we do at {business}. See you next time!",
    "You're so kind, {name} — thank you for trusting {business} with this. We're grateful for customers like you!",
  ],
  "high:great:brief": [
    "Thanks so much, {name}! Glad we could help — see you again at {business}.",
    "Really appreciate this, {name}. Thanks for choosing {business}!",
    "{name}, thank you! This means a lot to us at {business}.",
  ],
  "low:price:professional": [
    "Hi {name}, thank you for the feedback. We understand pricing concerns are important, and we'd welcome the chance to walk through the details with you directly — please reach out to {business} at your convenience so we can address this.",
    "{name}, we appreciate you sharing this. We aim to be transparent about our pricing and would like to better understand your experience — please contact {business} directly so we can discuss it.",
    "Thank you for your feedback, {name}. We'd like to learn more about your concerns regarding pricing — please give {business} a call so we can make this right.",
  ],
  "low:price:warm": [
    "{name}, thanks for letting us know — we hear you on pricing, and we really want to sort this out with you. Please reach out to {business} directly whenever works for you.",
    "We're sorry to hear pricing didn't sit right with you, {name}. We'd love to talk it through — please give {business} a call, we're happy to listen.",
    "{name}, thank you for the honest feedback. Let's talk — reach out to {business} directly and we'll see what we can do.",
  ],
  "low:price:brief": [
    "Thanks for the feedback, {name}. Please contact {business} directly so we can discuss pricing.",
    "{name}, we'd like to understand more — please reach out to {business} directly.",
    "Appreciate the note, {name}. Please call {business} so we can address this.",
  ],
  "low:timing:professional": [
    "Hi {name}, we're sorry your experience with timing didn't meet expectations. We take scheduling seriously and would like to understand what happened — please contact {business} directly so we can look into this.",
    "{name}, thank you for flagging this. Reliability matters to us at {business}, and we'd like the opportunity to discuss what went wrong — please reach out directly.",
    "We apologize for the inconvenience, {name}. Please contact {business} so we can review what happened with your appointment and make it right.",
  ],
  "low:timing:warm": [
    "{name}, we're really sorry about the timing issue — that's not the experience we want for anyone. Please reach out to {business} directly, we'd love the chance to fix this.",
    "So sorry about this, {name}. We know your time matters, and we'd like to talk it through — please give {business} a call.",
    "{name}, thank you for telling us. We want to make this right — please contact {business} directly whenever you can.",
  ],
  "low:timing:brief": [
    "Sorry about this, {name}. Please contact {business} so we can fix it.",
    "{name}, apologies for the delay. Please reach out to {business} directly.",
    "We hear you, {name}. Please call {business} so we can make this right.",
  ],
  "low:quality:professional": [
    "Hi {name}, we're sorry to hear the quality didn't meet your expectations. We hold ourselves to a high standard at {business} and would like to understand more — please contact us directly so we can address this properly.",
    "{name}, thank you for the feedback. We take quality concerns seriously and would appreciate the opportunity to discuss this — please reach out to {business} directly.",
    "We apologize the results weren't what you expected, {name}. Please contact {business} so we can review this with you and find a resolution.",
  ],
  "low:quality:warm": [
    "{name}, we're really sorry to hear this — that's not the standard we hold ourselves to at {business}. Please reach out directly, we want to make it right.",
    "Thank you for being honest with us, {name}. We'd love the chance to fix this — please contact {business} whenever works for you.",
    "{name}, we hear you and we're sorry. Please give {business} a call so we can look into what happened.",
  ],
  "low:quality:brief": [
    "Sorry to hear this, {name}. Please contact {business} so we can fix it.",
    "{name}, apologies. Please reach out to {business} directly.",
    "We'd like to make this right, {name} — please call {business}.",
  ],
  "mixed:mixed:professional": [
    "Hi {name}, thank you for the balanced feedback. We're glad parts of your experience went well, and we'd like to understand more about what fell short — please contact {business} directly so we can improve.",
    "{name}, we appreciate you sharing both sides of your experience. We'd welcome the chance to discuss the parts that didn't go as expected — please reach out to {business} directly.",
    "Thank you for the honest review, {name}. Please contact {business} so we can learn more and address the areas that need attention.",
  ],
  "mixed:mixed:warm": [
    "{name}, thanks for the honest review — glad some of it went well, and sorry the rest didn't. We'd love to hear more, please reach out to {business} directly.",
    "Thank you {name}! We're happy to hear the good parts, and we want to fix the rest — please give {business} a call whenever you can.",
    "{name}, we really appreciate this feedback. Please contact {business} directly so we can talk through what could've gone better.",
  ],
  "mixed:mixed:brief": [
    "Thanks for the honest feedback, {name}. Please contact {business} so we can improve.",
    "{name}, appreciate this. Please reach out to {business} directly.",
    "Thank you, {name}. Please call {business} so we can address the rest.",
  ],
  "low:fake:professional": [
    "Hi {name}, we've checked our records and were unable to find a visit matching this review. If this was posted in error, we'd appreciate an update — please contact {business} directly so we can look into it further.",
    "Thank you for the review. We take all feedback seriously, but we don't have a record matching this experience at {business} — please reach out directly so we can clarify.",
    "We appreciate you taking the time to leave a review. However, we were unable to locate an account or visit matching these details at {business} — please contact us directly if this was a mix-up.",
  ],
  "low:fake:warm": [
    "Hi there, we'd love to help but we can't find a visit matching this review at {business} — mind reaching out directly so we can sort it out together?",
    "Thanks for the note! We checked and couldn't find a matching visit at {business} — could this be for a different business? Happy to help if you reach out directly.",
    "We want to make sure everyone has a great experience — we just can't find a record of this visit at {business}. Please contact us directly so we can clarify.",
  ],
  "low:fake:brief": [
    "We couldn't find a matching visit at {business}. Please contact us directly to clarify.",
    "No record of this visit at {business} — please reach out directly.",
    "This doesn't match our records at {business}. Please contact us so we can look into it.",
  ],
};

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function ratingBand(rating: number): "high" | "low" | "mixed" {
  if (rating >= 4) return "high";
  if (rating === 3) return "mixed";
  return "low";
}

function buildKey(rating: number, scenario: Scenario, tone: Tone): TemplateKey {
  const band = ratingBand(rating);
  // Great-service templates only exist for the high band; complaint
  // templates only exist for low; mixed only for band=mixed. When a
  // scenario/rating combination has no direct template, fall back to the
  // closest matching family so we never render nothing.
  if (band === "high") return `high:great:${tone}` as TemplateKey;
  if (band === "mixed") return `mixed:mixed:${tone}` as TemplateKey;
  if (scenario === "fake") return `low:fake:${tone}` as TemplateKey;
  if (scenario === "price") return `low:price:${tone}` as TemplateKey;
  if (scenario === "timing") return `low:timing:${tone}` as TemplateKey;
  return `low:quality:${tone}` as TemplateKey;
}

const STEPS: { emoji: string; label: string }[] = [
  { emoji: "1️⃣", label: "Pick the stars" },
  { emoji: "2️⃣", label: "Pick what happened" },
  { emoji: "3️⃣", label: "Copy your reply" },
];

function StepStrip(): ReactElement {
  return (
    <div
      role="img"
      aria-label="Three steps: pick the stars, pick what happened, copy your reply."
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

function GoldenRulesBox(): ReactElement {
  return (
    <div
      role="note"
      aria-label="Golden rules: stay calm, say sorry once, take it offline, never argue."
      style={{
        marginTop: 12,
        border: `1px solid ${INK10}`,
        borderRadius: 12,
        padding: "12px 16px",
        background: "rgba(184,134,11,0.08)",
        fontSize: 13,
        lineHeight: 1.6,
        color: INK,
      }}
    >
      <strong>Golden rules:</strong> Stay calm · Say sorry once · Take it offline · Never argue
    </div>
  );
}

export function ReviewResponseGenerator(): ReactElement {
  const [rating, setRating] = useState(5);
  const [scenario, setScenario] = useState<Scenario>("great");
  const [business, setBusiness] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [seed, setSeed] = useState(0);
  const [copied, setCopied] = useState(false);

  const response = useMemo(() => {
    const key = buildKey(rating, scenario, tone);
    const variants = TEMPLATES[key] || TEMPLATES["high:great:professional"];
    const template = pick(variants, seed);
    const businessName = business.trim() || "our business";
    const name = customerName.trim() || "there";
    return template.replaceAll("{business}", businessName).replaceAll("{name}", name);
  }, [rating, scenario, tone, business, customerName, seed]);

  async function copyResponse(): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(response);
      } else {
        throw new Error("no clipboard api");
      }
    } catch {
      const el = document.createElement("textarea");
      el.value = response;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <StepStrip />

      <div style={{ display: "grid", gap: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Star rating</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRating(r)}
                aria-pressed={rating === r}
                aria-label={`${r} star${r === 1 ? "" : "s"}`}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: `1.5px solid ${rating === r ? GREEN : INK10}`,
                  background: rating === r ? "rgba(31, 43, 36,0.12)" : "#fff",
                  color: rating === r ? GREEN : INK,
                  fontWeight: 700,
                  fontSize: 14.5,
                  cursor: "pointer",
                }}
              >
                {"★".repeat(r)}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Scenario</span>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value as Scenario)}
            style={{ display: "block", width: "100%", marginTop: 8, padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${INK10}`, fontSize: 15, fontFamily: "inherit" }}
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {rating <= 2 && <GoldenRulesBox />}
        </label>

        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Business name</span>
            <input
              type="text"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="Sunrise Plumbing Co."
              style={{ display: "block", width: "100%", marginTop: 8, padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${INK10}`, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Customer first name (optional)</span>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jamie"
              style={{ display: "block", width: "100%", marginTop: 8, padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${INK10}`, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }}
            />
          </label>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Tone</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTone(t.id)}
                aria-pressed={tone === t.id}
                style={{
                  padding: "8px 18px",
                  borderRadius: 10,
                  border: `1.5px solid ${tone === t.id ? GREEN : INK10}`,
                  background: tone === t.id ? "rgba(31, 43, 36,0.12)" : "#fff",
                  color: tone === t.id ? GREEN : INK,
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 26, borderTop: `1px solid ${INK10}`, paddingTop: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 8 }}>
          Your response
        </div>
        <div style={{ border: `1px solid ${INK10}`, borderRadius: 12, padding: "16px 18px", background: "#fff", fontSize: 15, lineHeight: 1.6, color: INK }}>
          {response}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={copyResponse}
            style={{ background: copied ? GREEN : INK, color: "#F6F2EA", border: "none", padding: "11px 22px", borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
          >
            {copied ? "Copied!" : "Copy response"}
          </button>
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            style={{ border: `1.5px solid ${INK10}`, color: INK, background: "rgba(255,255,255,0.6)", padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
          >
            Regenerate
          </button>
        </div>
        <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
          No AI, no signup — carefully written templates you can edit freely before posting.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Build your AI front office free in ~3 minutes
        </a>
      </div>
    </div>
  );
}
