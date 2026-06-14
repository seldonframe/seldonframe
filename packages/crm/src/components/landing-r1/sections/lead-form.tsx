// landing-r1/sections/lead-form.tsx
//
// Speed-to-Lead bottom section. Archetype-themed (palette / fonts / radius
// via archetypeStyle() CSS vars — same theming contract as every other
// landing-r1 section; no hard-coded hex). Centered card: heading, subheading,
// Name · Phone · "What do you need?" (select from needOptions, else short
// text), bold submit, trust line, TCPA consent. Imports submitLeadFormAction
// directly (mirrors components/bookings/public-booking-form.tsx).

"use client";

import { useState, useTransition } from "react";
import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { submitLeadFormAction } from "@/lib/landing/lead-form-action";
import type { R1LeadFormSection } from "@/lib/landing/r1-payload-prompt";

const DEFAULTS = {
  heading: "Get a fast callback",
  subheading: "Tell us what you need — we'll text you a time in minutes.",
  needLabel: "What do you need?",
  consentText:
    "By submitting, you agree to receive texts about your request. Msg & data rates may apply. Reply STOP to opt out.",
};

/** First token of a full name, safe for empty input. */
function firstNameOf(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

/**
 * Pure confirm-copy decision. Exported for unit testing. Returns the
 * post-submit card content; copy adapts to whether the lead SMS went out.
 */
export function leadFormConfirmation(input: {
  name: string;
  smsSent: boolean;
  bookUrl: string;
}): { headline: string; body: string; showBookButton: boolean; bookUrl: string } {
  const first = firstNameOf(input.name);
  if (input.smsSent) {
    return {
      headline: first ? `Got it, ${first} — check your phone` : "Got it — check your phone",
      body: "We just texted you a booking link. Tap it to grab a time, or reply to that text and we'll get you booked.",
      showBookButton: false,
      bookUrl: input.bookUrl,
    };
  }
  return {
    headline: first ? `Got it, ${first}!` : "Got it!",
    body: "Thanks for reaching out — book instantly below and we'll see you soon.",
    showBookButton: true,
    bookUrl: input.bookUrl,
  };
}

export type LeadFormSectionProps = {
  orgSlug: string;
  businessName: string;
  archetype: AestheticArchetypeId;
  leadForm: R1LeadFormSection;
};

export function LeadFormSection({ orgSlug, businessName, archetype, leadForm }: LeadFormSectionProps) {
  const arch = ARCHETYPES[archetype];
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [need, setNeed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ReturnType<typeof leadFormConfirmation> | null>(null);

  const heading = leadForm.heading || DEFAULTS.heading;
  const subheading = leadForm.subheading || DEFAULTS.subheading;
  const needLabel = leadForm.needLabel || DEFAULTS.needLabel;
  const consentText = leadForm.consentText || DEFAULTS.consentText;
  const options = leadForm.needOptions ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !phone.trim()) {
      setError("Please enter your name and phone.");
      return;
    }
    startTransition(async () => {
      const res = await submitLeadFormAction({ orgSlug, name, phone, need });
      if (!res.ok) {
        setError(res.error || "Something went wrong. Please call us instead.");
        return;
      }
      setConfirm(leadFormConfirmation({ name, smsSent: res.smsSent, bookUrl: res.bookUrl }));
    });
  }

  return (
    <section
      id="lead-form"
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-leadform"
      aria-label={`Contact ${businessName}`}
    >
      <div className="sf-leadform-card">
        {confirm ? (
          <div className="sf-leadform-success" role="status">
            <h2 className="sf-leadform-heading">{confirm.headline}</h2>
            <p className="sf-leadform-sub">{confirm.body}</p>
            {confirm.showBookButton && confirm.bookUrl ? (
              <a className="sf-leadform-submit" href={confirm.bookUrl}>
                Book instantly
              </a>
            ) : null}
          </div>
        ) : (
          <>
            <h2 className="sf-leadform-heading">{heading}</h2>
            <p className="sf-leadform-sub">{subheading}</p>
            <form className="sf-leadform-form" onSubmit={handleSubmit}>
              <label className="sf-leadform-field">
                <span>Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
              <label className="sf-leadform-field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  required
                />
              </label>
              <label className="sf-leadform-field">
                <span>{needLabel}</span>
                {options.length > 0 ? (
                  <select value={need} onChange={(e) => setNeed(e.target.value)}>
                    <option value="">Select…</option>
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={need}
                    onChange={(e) => setNeed(e.target.value)}
                    placeholder="Briefly, what do you need?"
                  />
                )}
              </label>

              {error ? (
                <p className="sf-leadform-error" role="alert">
                  {error}
                </p>
              ) : null}

              <button type="submit" className="sf-leadform-submit" disabled={pending}>
                {pending ? "Sending…" : "Get my callback"}
              </button>
              <p className="sf-leadform-trust">★★★★★ Trusted by your neighbors</p>
              <p className="sf-leadform-consent">{consentText}</p>
            </form>
          </>
        )}
      </div>

      <style jsx>{`
        .sf-leadform {
          background: var(--surface, #f5f5f5);
          color: var(--text, #111);
          font-family: var(--font-body);
          padding: clamp(48px, 8vw, 96px) 20px;
          display: flex;
          justify-content: center;
        }
        .sf-leadform-card {
          width: 100%;
          max-width: 520px;
          background: var(--bg, #fff);
          border: 1px solid var(--border, #e5e5e5);
          border-radius: 16px;
          padding: clamp(24px, 5vw, 40px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
        }
        .sf-leadform-heading {
          font-family: var(--font-headline);
          font-size: clamp(24px, 4vw, 34px);
          font-weight: 700;
          line-height: 1.1;
          margin: 0 0 8px;
          color: var(--text);
        }
        .sf-leadform-sub {
          font-size: 15px;
          line-height: 1.55;
          margin: 0 0 24px;
          color: color-mix(in oklab, var(--text) 72%, transparent);
        }
        .sf-leadform-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sf-leadform-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sf-leadform-field span {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .sf-leadform-field input,
        .sf-leadform-field select {
          height: 48px;
          padding: 0 14px;
          font-size: 16px;
          color: var(--text);
          background: var(--bg, #fff);
          border: 1px solid var(--border, #d9d9d9);
          border-radius: 10px;
          outline: none;
        }
        .sf-leadform-field input:focus,
        .sf-leadform-field select:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 24%, transparent);
        }
        .sf-leadform-submit {
          height: 52px;
          margin-top: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          text-decoration: none;
          color: var(--primary-ink, #fff);
          background: var(--primary);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: background 160ms ease, transform 120ms ease;
        }
        .sf-leadform-submit:hover {
          background: color-mix(in oklab, var(--primary) 88%, #000);
        }
        .sf-leadform-submit:active {
          transform: translateY(1px);
        }
        .sf-leadform-submit:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .sf-leadform-trust {
          margin: 12px 0 0;
          text-align: center;
          font-size: 13px;
          color: color-mix(in oklab, var(--text) 60%, transparent);
        }
        .sf-leadform-consent {
          margin: 8px 0 0;
          font-size: 11px;
          line-height: 1.45;
          color: color-mix(in oklab, var(--text) 50%, transparent);
        }
        .sf-leadform-error {
          margin: 0;
          font-size: 14px;
          color: #dc2626;
        }
        .sf-leadform-success {
          text-align: center;
        }
        .sf-leadform-success .sf-leadform-submit {
          margin-top: 16px;
        }
      `}</style>
    </section>
  );
}
