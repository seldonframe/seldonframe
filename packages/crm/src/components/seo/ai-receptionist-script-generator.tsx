"use client";

// The AI receptionist script generator — the interactive island of
// /tools/ai-receptionist-script-generator. Pure client-side template
// composition: it string-builds a complete call script from the operator's
// inputs. No LLM, no network calls, no signup. The generated script doubles
// as a live demo of what SeldonFrame deploys onto a real phone number or web
// chat — so we present it honestly as a strong STARTING TEMPLATE, not a
// production-ready agent. Styled on the MKT palette to match the other
// free-tool pages.

import { useMemo, useState, type ReactElement } from "react";
import { copyToClipboard } from "@/components/seo/result-card";

const INK = "#221D17";
const GREEN = "#00897B";
const INK10 = "rgba(34,29,23,0.10)";

type BizType =
  | "plumbing"
  | "hvac"
  | "electrical"
  | "salon"
  | "medspa"
  | "dental"
  | "cleaning"
  | "law"
  | "other";

type Goal = "book" | "lead" | "faq";
type AfterHours = "text" | "message" | "book";

const BIZ_TYPES: { id: BizType; label: string }[] = [
  { id: "plumbing", label: "Plumbing" },
  { id: "hvac", label: "HVAC" },
  { id: "electrical", label: "Electrical" },
  { id: "salon", label: "Salon" },
  { id: "medspa", label: "Med Spa" },
  { id: "dental", label: "Dental" },
  { id: "cleaning", label: "Cleaning" },
  { id: "law", label: "Law" },
  { id: "other", label: "Other" },
];

const GOALS: { id: Goal; label: string }[] = [
  { id: "book", label: "Book an appointment" },
  { id: "lead", label: "Capture a lead" },
  { id: "faq", label: "Answer FAQs" },
];

const AFTER_HOURS: { id: AfterHours; label: string }[] = [
  { id: "text", label: "Text the caller back" },
  { id: "message", label: "Take a message" },
  { id: "book", label: "Book anyway (24/7)" },
];

// Common presets so operators don't have to type hours; still free-text.
const HOURS_PRESETS: string[] = [
  "Mon–Fri 8am–5pm",
  "Mon–Sat 7am–7pm",
  "Mon–Fri 9am–6pm, Sat 9am–1pm",
  "24/7",
];

/** Human label for a business type, used inline in the generated script. */
const BIZ_LABEL: Record<BizType, string> = {
  plumbing: "plumbing",
  hvac: "HVAC",
  electrical: "electrical",
  salon: "salon",
  medspa: "med spa",
  dental: "dental",
  cleaning: "cleaning",
  law: "law",
  other: "business",
};

/** 3–4 qualifying questions tailored to each business type. These are the
 *  questions a good human front desk would ask to route or quote the call. */
const QUALIFYING: Record<BizType, string[]> = {
  plumbing: [
    "Is this an emergency — active leak, no water, or a backed-up drain — or something we can schedule?",
    "What's the address where the work is needed?",
    "Roughly how long has the issue been going on?",
    "Is the property a home or a commercial space?",
  ],
  hvac: [
    "Is your system not heating, not cooling, or making a strange noise?",
    "What's the address of the property?",
    "Do you know the approximate age of the unit?",
    "Is this a repair, a maintenance tune-up, or a new install quote?",
  ],
  electrical: [
    "Is this a safety issue — sparking, burning smell, or lost power — or a planned project?",
    "What's the service address?",
    "Is the property residential or commercial?",
    "Roughly what work are you looking to have done?",
  ],
  salon: [
    "Which service are you interested in today?",
    "Do you have a stylist you usually see, or should I match you with the next available?",
    "What days and times generally work best for you?",
    "Is this your first visit with us?",
  ],
  medspa: [
    "Which treatment are you interested in?",
    "Have you had this treatment with us before, or is this a first consultation?",
    "Are there any dates or times that work best for you?",
    "How did you hear about us?",
  ],
  dental: [
    "Are you in any pain right now, or is this a routine visit?",
    "Are you a current patient, or would this be your first visit?",
    "Do you have dental insurance you'd like us to check?",
    "What days and times generally work for you?",
  ],
  cleaning: [
    "Is this for a home or a commercial space?",
    "Roughly how many bedrooms and bathrooms, or what square footage?",
    "Are you looking for a one-time clean or recurring service?",
    "What's the address and your ideal start date?",
  ],
  law: [
    "What type of legal matter can we help you with?",
    "Is there a deadline or court date we should be aware of?",
    "Have you worked with an attorney on this matter already?",
    "What's the best way to reach you for a callback from the attorney?",
  ],
  other: [
    "How can we help you today?",
    "Is this time-sensitive, or something we can schedule?",
    "What's the best phone number and email to reach you?",
    "How did you hear about us?",
  ],
};

interface ScriptInputs {
  businessName: string;
  bizType: BizType;
  hours: string;
  services: string;
  goal: Goal;
  afterHours: AfterHours;
}

/** The heart of the tool: compose a complete, structured call script from the
 *  inputs. Pure string building — deterministic, no randomness, no network. */
function buildScript(inp: ScriptInputs): string {
  const name = inp.businessName.trim() || "your business";
  const typeLabel = BIZ_LABEL[inp.bizType];
  const hours = inp.hours.trim() || "our regular business hours";
  const services = inp.services.trim();
  const questions = QUALIFYING[inp.bizType];

  const lines: string[] = [];

  // 1. Greeting + identity (with honest AI disclosure)
  lines.push("── GREETING & IDENTITY ──");
  lines.push(
    `"Thanks for calling ${name}. This is the ${name} virtual assistant — I can help you get scheduled or pass your details straight to the team. Who do I have the pleasure of speaking with?"`,
  );
  lines.push("");
  lines.push(
    `[After the caller gives their name] "Great to meet you, {caller name}. How can I help you today?"`,
  );
  lines.push("");

  // 2. Qualifying questions tailored to the business type
  lines.push(`── QUALIFYING QUESTIONS (${typeLabel}) ──`);
  lines.push("Ask these one at a time, and wait for each answer:");
  questions.forEach((q, i) => {
    lines.push(`${i + 1}. "${q}"`);
  });
  if (services) {
    lines.push("");
    lines.push(
      `[If the caller is unsure what they need] "We handle ${services} — does one of those sound like what you're after?"`,
    );
  }
  lines.push("");

  // 3. Primary goal — booking / lead capture / FAQ handoff
  lines.push("── PRIMARY GOAL ──");
  if (inp.goal === "book") {
    lines.push(
      `"Perfect — let's get you on the calendar. We're open ${hours}. What day works best for you?"`,
    );
    lines.push("");
    lines.push(
      `[Offer two concrete options] "I have {first option} or {second option} — which is better?"`,
    );
    lines.push("");
    lines.push(
      `[Confirm by reading it back] "To confirm, I've got you down for {day and time}. I'll text a confirmation to this number — is that the best one to reach you?"`,
    );
  } else if (inp.goal === "lead") {
    lines.push(
      `"Got it. Let me grab your details so the right person can follow up. What's the best phone number and email for you?"`,
    );
    lines.push("");
    lines.push(
      `[Read the details back] "Let me make sure I have that right: {phone} and {email} — did I get that correct?"`,
    );
    lines.push("");
    lines.push(
      `"Thanks, {caller name}. Someone from ${name} will reach out within {your promised window}. Is there anything else I should pass along?"`,
    );
  } else {
    lines.push(
      `"Happy to help with that. Here's what I can tell you — and if you'd like, I can also get you scheduled or have someone follow up."`,
    );
    lines.push("");
    lines.push(
      `[Answer only from approved, grounded information; if unsure, say so] "That's a great question — I want to make sure I give you the right answer, so let me have {team member} confirm and get back to you. What's the best number to reach you?"`,
    );
    lines.push(`We're open ${hours}.`);
  }
  lines.push("");

  // 4. Objection / "just looking" handle
  lines.push('── "JUST LOOKING" / OBJECTION HANDLE ──');
  lines.push(
    `[If the caller is hesitant or just comparing] "Totally understand — no pressure at all. Can I at least grab your name and number so we can send you the details? That way you have everything when you're ready."`,
  );
  lines.push("");
  lines.push(
    `[If asked about price] "It depends on the specifics, so I don't want to quote you the wrong number. The best next step is a quick {visit / consult} — want me to set that up, or just take your info for a callback?"`,
  );
  lines.push("");

  // 5. After-hours fallback
  lines.push("── AFTER-HOURS FALLBACK ──");
  lines.push(`Trigger this branch when a call comes in outside ${hours}:`);
  if (inp.afterHours === "text") {
    lines.push(
      `"Thanks for calling ${name}. We're currently closed, but I can text you right back so we don't lose your spot. What's the best number, and what can we help with?"`,
    );
  } else if (inp.afterHours === "message") {
    lines.push(
      `"Thanks for calling ${name}. Our team is out right now, but I'll take a detailed message and make sure it's the first thing they see. Can I get your name, number, and what you need?"`,
    );
  } else {
    lines.push(
      `"Thanks for calling ${name}. Even though the office is closed, I can still get you booked right now. What day works best for you?"`,
    );
  }
  lines.push("");

  // 6. Close
  lines.push("── CLOSE ──");
  lines.push(
    `"Thanks so much, {caller name} — you're all set. Have a great {day/evening}, and we'll talk soon!"`,
  );

  return lines.join("\n");
}

const STEPS: { emoji: string; label: string }[] = [
  { emoji: "1️⃣", label: "Describe your business" },
  { emoji: "2️⃣", label: "Pick the goal" },
  { emoji: "3️⃣", label: "Copy your script" },
];

function StepStrip(): ReactElement {
  return (
    <div
      role="img"
      aria-label="Three steps: describe your business, pick the goal, copy your script."
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

function ProductionNote(): ReactElement {
  return (
    <div
      role="note"
      aria-label="This is a starting template, not a production-ready agent."
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
      <strong>This is a strong starting template, not a finished agent.</strong> A real phone
      agent also needs grounding in your actual services and prices, enforced read-back
      confirmation, and guardrails so it never invents an answer or over-promises. That layer is
      exactly what SeldonFrame adds on top of a script like this.
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

export function AiReceptionistScriptGenerator(): ReactElement {
  const [businessName, setBusinessName] = useState("");
  const [bizType, setBizType] = useState<BizType>("plumbing");
  const [hours, setHours] = useState("Mon–Fri 8am–5pm");
  const [services, setServices] = useState("");
  const [goal, setGoal] = useState<Goal>("book");
  const [afterHours, setAfterHours] = useState<AfterHours>("text");
  const [copied, setCopied] = useState(false);

  const script = useMemo(
    () => buildScript({ businessName, bizType, hours, services, goal, afterHours }),
    [businessName, bizType, hours, services, goal, afterHours],
  );

  async function handleCopy(): Promise<void> {
    const ok = await copyToClipboard(script);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDownload(): void {
    if (typeof document === "undefined") return;
    const blob = new Blob([script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const safe = (businessName.trim() || "ai-receptionist").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe || "ai-receptionist"}-script.txt`;
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
            <span style={labelSpan}>Business name</span>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Sunrise Plumbing Co."
              style={fieldStyle}
            />
          </label>
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
        </div>

        <label style={labelStyle}>
          <span style={labelSpan}>Business hours</span>
          <input
            type="text"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            list="sf-hours-presets"
            placeholder="Mon–Fri 8am–5pm"
            style={fieldStyle}
          />
          <datalist id="sf-hours-presets">
            {HOURS_PRESETS.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </label>

        <label style={labelStyle}>
          <span style={labelSpan}>Top services (comma separated)</span>
          <input
            type="text"
            value={services}
            onChange={(e) => setServices(e.target.value)}
            placeholder="drain cleaning, water heaters, leak repair"
            style={fieldStyle}
          />
        </label>

        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label style={labelStyle}>
            <span style={labelSpan}>Primary goal of the call</span>
            <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)} style={fieldStyle}>
              {GOALS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelSpan}>After-hours behavior</span>
            <select value={afterHours} onChange={(e) => setAfterHours(e.target.value as AfterHours)} style={fieldStyle}>
              {AFTER_HOURS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={{ marginTop: 26, borderTop: `1px solid ${INK10}`, paddingTop: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 8 }}>
          Your AI receptionist script
        </div>
        <pre
          style={{
            border: `1px solid ${INK10}`,
            borderRadius: 12,
            padding: "16px 18px",
            background: "#fff",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: INK,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "'Hanken Grotesk',system-ui,sans-serif",
            margin: 0,
            maxHeight: 460,
            overflowY: "auto",
          }}
        >
          {script}
        </pre>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{ background: copied ? GREEN : INK, color: "#F6F2EA", border: "none", padding: "11px 22px", borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
          >
            {copied ? "Copied!" : "Copy script"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            style={{ border: `1.5px solid ${INK10}`, color: INK, background: "rgba(255,255,255,0.6)", padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
          >
            Download .txt
          </button>
        </div>
        <ProductionNote />
        <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
          No AI, no signup — this is built in your browser by filling in a proven call structure.
          Placeholders in {"{curly braces}"} are cues for the agent to fill live on the call.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Deploy this agent free
        </a>
        <a
          href="https://app.seldonframe.com/book/seldonframes-workspace-7798/default"
          style={{ border: `1.5px solid ${INK10}`, color: INK, background: "rgba(255,255,255,0.6)", padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}
        >
          Book a demo call
        </a>
      </div>
    </div>
  );
}
