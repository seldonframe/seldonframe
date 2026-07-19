"use client";

// The service-business FAQ generator — the interactive island of
// /tools/service-business-faq-generator. Pure client-side template
// composition: it string-builds a ready set of customer-facing FAQ
// question+answer pairs from a few inputs. No LLM, no network calls, no
// signup. Honesty rule (never-lies): every business-specific fact the tool
// can't know — hours, prices, guarantees, license numbers — is left as an
// obvious [bracketed placeholder] for the owner to fill in, rather than
// invented. The output doubles as a knowledge base an AI agent can be
// grounded on, which is exactly what SeldonFrame deploys. Styled on the MKT
// palette to match the other free-tool pages.

import { useMemo, useState, type ReactElement } from "react";
import { copyToClipboard } from "@/components/seo/result-card";

const INK = "#221D17";
const GREEN = "#1F2B24";
const INK10 = "rgba(34,29,23,0.10)";

type BizType =
  | "plumbing"
  | "hvac"
  | "electrical"
  | "salon"
  | "medspa"
  | "dental"
  | "cleaning"
  | "landscaping"
  | "roofing"
  | "law"
  | "other";

type Pricing = "free-estimates" | "flat-rate" | "hourly" | "quote-based";
type Booking = "online" | "call" | "text";

const BIZ_TYPES: { id: BizType; label: string }[] = [
  { id: "plumbing", label: "Plumbing" },
  { id: "hvac", label: "HVAC" },
  { id: "electrical", label: "Electrical" },
  { id: "salon", label: "Salon" },
  { id: "medspa", label: "Med Spa" },
  { id: "dental", label: "Dental" },
  { id: "cleaning", label: "Cleaning" },
  { id: "landscaping", label: "Landscaping" },
  { id: "roofing", label: "Roofing" },
  { id: "law", label: "Law" },
  { id: "other", label: "Other" },
];

const PRICING_MODELS: { id: Pricing; label: string }[] = [
  { id: "free-estimates", label: "Free estimates" },
  { id: "flat-rate", label: "Flat-rate pricing" },
  { id: "hourly", label: "Hourly rate" },
  { id: "quote-based", label: "Quote-based / per project" },
];

const BOOKING_METHODS: { id: Booking; label: string }[] = [
  { id: "online", label: "Online booking" },
  { id: "call", label: "Call us" },
  { id: "text", label: "Text us" },
];

/** Business types where an emergency / same-day question belongs, mapped to
 *  the kinds of urgent problem their customers actually call about. */
const EMERGENCY_EXAMPLES: Partial<Record<BizType, string>> = {
  plumbing: "a burst pipe, no water, or a major leak",
  hvac: "no heat in winter or no cooling in a heat wave",
  electrical: "sparking, a burning smell, or a total power loss",
  roofing: "an active leak or storm damage",
};

/** What a customer should expect at the appointment, tailored per trade.
 *  Kept honest: describes the flow, never promises a specific price or time. */
const WHAT_TO_EXPECT: Record<BizType, string> = {
  plumbing:
    "Our technician will arrive within your booking window, diagnose the issue, and walk you through your options and pricing before starting any work.",
  hvac:
    "Our technician will inspect your system, explain what's going on in plain language, and confirm the price with you before any repair or install.",
  electrical:
    "Our electrician will assess the work safely, explain what's needed and why, and confirm pricing with you before starting.",
  salon:
    "Please arrive a few minutes early. We'll talk through exactly what you're looking for, and your stylist will confirm the plan before getting started.",
  medspa:
    "We'll start with a short consultation to confirm the treatment is right for you, review any prep and aftercare, and answer your questions before we begin.",
  dental:
    "We'll review your history, complete your exam, and go over any recommended treatment and its cost before moving forward — no surprises.",
  cleaning:
    "Our team arrives within your scheduled window with all supplies. Point out any priorities or problem areas and we'll take it from there.",
  landscaping:
    "We'll walk the property with you, confirm the scope of work, and provide pricing before starting. [Note anything to prepare — e.g. pets indoors, gate access.]",
  roofing:
    "We'll inspect the roof, document any issues (photos on request), and give you a clear written assessment and quote before any work begins.",
  law:
    "Your first meeting is a chance to explain your situation. We'll review the details, outline your options, and explain next steps and any fees before you commit.",
  other:
    "We'll confirm exactly what you need, walk you through your options and pricing, and get your approval before starting any work.",
};

const PRICING_ANSWER: Record<Pricing, string> = {
  "free-estimates":
    "We offer free estimates. [Add any conditions here — e.g. free within [your service area], with a trip fee beyond it.] The final price depends on the scope of the job, and we'll confirm it with you in writing before any work begins.",
  "flat-rate":
    "We use flat-rate pricing, so you know the full price before we start — no surprise hourly charges. [Add your typical price ranges for common jobs here so customers have a ballpark.]",
  hourly:
    "We bill hourly at [your hourly rate]. [Note any minimum charge, trip fee, or how you estimate total hours here.] We'll give you an estimate up front so there are no surprises.",
  "quote-based":
    "Every job is quoted individually based on the scope and materials involved. Tell us what you need and we'll put together a detailed written quote — [note your typical turnaround, e.g. same day or within 24 hours].",
};

interface FaqInputs {
  bizType: BizType;
  area: string;
  pricing: Pricing;
  booking: Booking;
}

interface FaqItem {
  q: string;
  a: string;
}

function bookingAnswer(booking: Booking): string {
  switch (booking) {
    case "online":
      return "The fastest way to book is online at [your booking link]. Pick a time that works for you and you'll get an instant confirmation.";
    case "call":
      return "The best way to book is to call us at [your phone number]. [Your hours] — leave a message any time outside those hours and we'll call you right back.";
    case "text":
      return "The easiest way to book is to text us at [your number]. Send over what you need and a couple of times that work, and we'll confirm your appointment.";
  }
}

/** Compose the full customer-facing FAQ set from the inputs. Pure string
 *  building — deterministic, no randomness, no network. Base questions are
 *  shared by every service business; a couple more are added per trade so the
 *  set always lands between 10 and 14 pairs. */
function buildFaqs(inp: FaqInputs): FaqItem[] {
  const areaText = inp.area.trim() || "[your service area]";
  const isEmergency = inp.bizType in EMERGENCY_EXAMPLES;

  const faqs: FaqItem[] = [];

  faqs.push({
    q: "What areas do you serve?",
    a: `We serve ${areaText} and the surrounding areas. [List the specific towns, neighborhoods, or zip codes you cover here so customers can quickly tell whether they're in range.]`,
  });

  faqs.push({
    q: "What are your hours?",
    a: "Our hours are [your hours — e.g. Mon–Fri 8am–5pm]. [Add weekend, holiday, or after-hours availability here.]",
  });

  if (isEmergency) {
    const examples = EMERGENCY_EXAMPLES[inp.bizType] ?? "an urgent problem";
    faqs.push({
      q: "Do you offer emergency or same-day service?",
      a: `[State whether you offer 24/7, after-hours, or same-day emergency service — and any emergency rate — here.] For urgent issues like ${examples}, [tell customers the fastest way to reach you].`,
    });
  }

  faqs.push({
    q: "How do I book an appointment?",
    a: bookingAnswer(inp.booking),
  });

  faqs.push({
    q: "How does your pricing work?",
    a: PRICING_ANSWER[inp.pricing],
  });

  faqs.push({
    q: "Will I know the price before any work starts?",
    a: "Yes. We'll confirm the full price with you in writing before any work begins — no hidden fees or surprise charges. [Note any diagnostic or trip fee here, and whether it's applied to the final bill.]",
  });

  faqs.push({
    q: "What payment methods do you accept?",
    a: "We accept [list your accepted payment methods — e.g. cash, all major cards, check]. [Note any deposit, financing options, or invoicing terms here.]",
  });

  faqs.push({
    q: "Are you licensed and insured?",
    a: "[State your license number(s) and confirm that you're fully insured here.] We're happy to provide proof of insurance on request.",
  });

  faqs.push({
    q: "Do you guarantee your work?",
    a: "[Describe your workmanship or satisfaction guarantee here, including any warranty period.] If something isn't right, [tell customers exactly how to reach you and what you'll do to make it right].",
  });

  faqs.push({
    q: "How soon can I get an appointment?",
    a: "[Share your typical availability here — e.g. same-week, next-day, or a current wait time.] [If you keep slots open for last-minute or emergency work, mention that here.] Booking early gives you the best choice of times.",
  });

  faqs.push({
    q: "What should I expect at my appointment?",
    a: WHAT_TO_EXPECT[inp.bizType],
  });

  faqs.push({
    q: "What is your cancellation or rescheduling policy?",
    a: "[Describe your cancellation and rescheduling policy here — e.g. how much notice you need and any fee.] The easiest way to change an appointment is to reach out the same way you booked.",
  });

  // One or two trade-specific additions so the set stays rich and relevant.
  switch (inp.bizType) {
    case "salon":
      faqs.push({
        q: "I'm a new client — what should I know?",
        a: "Welcome! [Note anything new clients should bring or do — e.g. arrive 10 minutes early, whether a consultation is included.] If you have photos or ideas, bring them and we'll match you with the right stylist.",
      });
      break;
    case "medspa":
      faqs.push({
        q: "Is this my first treatment — what happens at a consultation?",
        a: "For new clients we start with a consultation to make sure the treatment is right for you and to review prep and aftercare. [Note whether the consultation is free and roughly how long it takes here.]",
      });
      break;
    case "dental":
      faqs.push({
        q: "I'm a new patient — how do I get started?",
        a: "Welcome! Please bring [your photo ID and insurance card]. [Describe your new-patient exam and any paperwork to complete in advance here.] We'll check your coverage and go over any costs before treatment.",
      });
      break;
    case "cleaning":
      faqs.push({
        q: "Do you offer recurring or one-time cleaning?",
        a: "We offer both. [Describe your recurring options — e.g. weekly, bi-weekly, or monthly — and any discount for regular service here.] Tell us what works for you and we'll set up a schedule.",
      });
      break;
    case "landscaping":
      faqs.push({
        q: "Do you offer recurring maintenance or one-time projects?",
        a: "We handle both ongoing maintenance and one-time projects. [Describe your recurring maintenance plans and pricing here.] Let us know your goals and we'll recommend the right plan.",
      });
      break;
    case "law":
      faqs.push({
        q: "Do you offer a free consultation?",
        a: "[State whether your initial consultation is free or paid, and how long it typically lasts, here.] Reach out and we'll get you scheduled with the right attorney for your matter.",
      });
      break;
    default:
      break;
  }

  return faqs;
}

function faqsToText(faqs: FaqItem[]): string {
  return faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
}

const STEPS: { emoji: string; label: string }[] = [
  { emoji: "1️⃣", label: "Describe your business" },
  { emoji: "2️⃣", label: "Pick pricing & booking" },
  { emoji: "3️⃣", label: "Copy your FAQ" },
];

function StepStrip(): ReactElement {
  return (
    <div
      role="img"
      aria-label="Three steps: describe your business, pick pricing and booking, copy your FAQ."
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

function HonestyNote(): ReactElement {
  return (
    <div
      role="note"
      aria-label="Answers are honest templates — the bracketed placeholders are yours to fill in."
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
      <strong>These are honest templates, not invented facts.</strong> We never make up your hours,
      prices, guarantees, or license numbers. Anything in [square brackets] is a cue for you to fill
      in with your real details before you publish — so every answer a customer reads is true.
    </div>
  );
}

const labelStyle = { display: "block" as const };
const labelSpan = { fontWeight: 700, fontSize: 15 };
const fieldStyle = {
  display: "block" as const,
  width: "100%",
  marginTop: 8,
  padding: "11px 12px",
  borderRadius: 10,
  border: `1.5px solid ${INK10}`,
  fontSize: 15,
  fontFamily: "inherit",
  boxSizing: "border-box" as const,
};

export function ServiceBusinessFaqGenerator(): ReactElement {
  const [bizType, setBizType] = useState<BizType>("plumbing");
  const [area, setArea] = useState("");
  const [pricing, setPricing] = useState<Pricing>("free-estimates");
  const [booking, setBooking] = useState<Booking>("call");
  const [copied, setCopied] = useState(false);

  const faqs = useMemo(
    () => buildFaqs({ bizType, area, pricing, booking }),
    [bizType, area, pricing, booking],
  );

  async function handleCopy(): Promise<void> {
    const ok = await copyToClipboard(faqsToText(faqs));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDownload(): void {
    if (typeof document === "undefined") return;
    const blob = new Blob([faqsToText(faqs)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const safe = (area.trim() || bizType).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe || "service-business"}-faq.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <StepStrip />

      <div style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label style={labelStyle}>
            <span style={labelSpan}>Business type</span>
            <select value={bizType} onChange={(e) => setBizType(e.target.value as BizType)} style={fieldStyle}>
              {BIZ_TYPES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelSpan}>Service area / city</span>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Austin, TX"
              style={fieldStyle}
            />
          </label>
        </div>

        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label style={labelStyle}>
            <span style={labelSpan}>Pricing model</span>
            <select value={pricing} onChange={(e) => setPricing(e.target.value as Pricing)} style={fieldStyle}>
              {PRICING_MODELS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelSpan}>How customers book</span>
            <select value={booking} onChange={(e) => setBooking(e.target.value as Booking)} style={fieldStyle}>
              {BOOKING_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={{ marginTop: 26, borderTop: `1px solid ${INK10}`, paddingTop: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>
            Your customer FAQ
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: GREEN }}>{faqs.length} questions</div>
        </div>

        <div style={{ display: "grid", gap: 10, maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
          {faqs.map((f, i) => (
            <div
              key={f.q}
              style={{ border: `1px solid ${INK10}`, borderRadius: 12, padding: "14px 18px", background: "#fff" }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: INK, marginBottom: 6 }}>
                {i + 1}. {f.q}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.78)" }}>{f.a}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{ background: copied ? GREEN : INK, color: "#F6F2EA", border: "none", padding: "11px 22px", borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
          >
            {copied ? "Copied!" : "Copy all"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            style={{ border: `1.5px solid ${INK10}`, color: INK, background: "rgba(255,255,255,0.6)", padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
          >
            Download .txt
          </button>
        </div>

        <HonestyNote />

        <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
          No AI, no signup — this is built in your browser from a proven FAQ structure. Fill in the
          [bracketed placeholders] with your real details before you post it.
        </p>
      </div>

      <div
        style={{
          marginTop: 22,
          border: `1px solid ${INK10}`,
          borderRadius: 14,
          padding: "18px 20px",
          background: "rgba(31, 43, 36,0.06)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: INK, marginBottom: 6 }}>
          Turn this FAQ into an AI agent that answers 24/7
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>
          This same FAQ is exactly what an AI front desk needs to be grounded. Import it straight into
          your SeldonFrame workspace as your agent&apos;s Knowledge, and it answers every customer
          question by phone, web chat, or text — using only your real answers, never made-up ones.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
            Turn this into your AI agent&apos;s knowledge — free
          </a>
          <a
            href="https://app.seldonframe.com/book/seldonframes-workspace-7798/default"
            style={{ border: `1.5px solid ${INK10}`, color: INK, background: "rgba(255,255,255,0.6)", padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}
          >
            Book a demo call
          </a>
        </div>
      </div>
    </div>
  );
}
