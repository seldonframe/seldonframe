"use client";

// v1.36.1 — booking page complete UI rebuild.
//
// PRE-v1.36.1: bare card with a left-column DayPicker and right-column
// time-slot grid. Confirmed at atlantic-plumbing.app.seldonframe.com/book
// to look unbranded, plain, and broken-feeling next to industry
// references like Cal.com, Calendly, or hvac.tirionforge.com/book.
//
// v1.36.1 KEEPS the entire state machine + action calls (no
// behavioral changes) and REPLACES the JSX shell with a richer
// layout matching the industry-standard "schedule a meeting" pattern:
//
//   Top bar (full width):
//     [Business name]                    [Tap-to-call phone CTA]
//
//   Body card (single rounded card, two columns):
//     LEFT (~38%):
//       SCHEDULE A SERVICE eyebrow
//       Appointment title (large)
//       Appointment description
//       Meta list: duration · on-site · timezone
//       BOOKING WITH eyebrow + business name
//
//     RIGHT (~62%):
//       3-step progress (Pick a date · Choose a time · Confirm details)
//       Calendar (when step 1) / Time slots (when step 2) / Form (when step 3)
//
// State machine extends from 2 steps to 3 ("pick-date" instead of
// pick-time, then "pick-time", then "enter-details") so the time-slot
// view gets its own dedicated step. Same actions, same handlers,
// same success screen — just a richer flow.
//
// Invariants preserved:
//   - calls listPublicBookingSlotsAction + submitPublicBookingAction
//   - demo-readonly + demo-blocked-error handling via showDemoToast
//   - Stripe checkout redirect via response.checkoutUrl
//   - hidden timezone passed through on submit
//   - price-aware submit label ($X or "Book")
//   - success confirmation screen
//
// New props (v1.36.1):
//   - businessName: header
//   - businessPhone: tap-to-call CTA in header (null = no CTA rendered)
//   - appointmentName: left-sidebar title
//   - appointmentDescription: left-sidebar paragraph

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Phone, Check, Star } from "lucide-react";
import { PUBLIC_BOOKING_WINDOW_DAYS } from "@/lib/bookings/booking-window";
import type { R1Testimonial, R1TestimonialsSection } from "@/lib/landing/r1-payload-prompt";

import {
  listPublicBookingSlotsAction,
  submitPublicBookingAction,
  type BookingIntakeField,
} from "@/lib/bookings/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// v1.40.2 — format a UTC ISO slot string in the workspace's timezone.
// Pre-1.40.2 we used the browser's locale-default TZ which DISAGREED
// with the slot generator's server-local UTC. Now slots are UTC ISO
// (unambiguous) and we explicitly pass workspace TZ for display.
function toTimeLabel(value: string, timeZone: string) {
  const date = new Date(value);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function formatSelectedDateHeading(date: Date, timeZone: string) {
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

// Pretty short TZ abbreviation (CST, EDT, PT, etc.) for the picker
// header so customers know which zone the slots represent.
function shortTimezoneAbbr(timeZone: string, sample = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(sample);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function toTelLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

type Step = "pick-date" | "pick-time" | "enter-details";

export function PublicBookingForm({
  orgSlug,
  bookingSlug,
  durationMinutes,
  confirmationFallback,
  price,
  businessName,
  businessPhone,
  appointmentName,
  appointmentDescription,
  intakeFields = [],
  workspaceTimezone,
  logoUrl = null,
  testimonials = [],
  testimonialsEyebrow,
  testimonialsHeading,
  testimonialsReviewSummary,
}: {
  orgSlug: string;
  bookingSlug: string;
  durationMinutes: number;
  confirmationFallback: string;
  price: number;
  businessName: string;
  businessPhone: string | null;
  appointmentName: string;
  appointmentDescription: string;
  /** v1.40.1 — vertical-aware booking form fields. Rendered after
   *  name + email. Empty array → renders the legacy notes-only flow. */
  intakeFields?: BookingIntakeField[];
  /** v1.40.2 — workspace IANA TZ (e.g. "America/Chicago"). Slots
   *  are UTC ISO strings; we format them in this TZ for display so
   *  customer sees operator's actual hours, not their browser-local
   *  reinterpretation. Required — caller must thread this through. */
  workspaceTimezone: string;
  /** 2026-05-18 — operator-supplied workspace logo (theme.logoUrl).
   *  When set, renders in the header next to businessName. Null →
   *  text-only header. The theme write path (saveThemeForOrg) already persists this
   *  field; this prop just plumbs it through to the public surface.
   *  Replaces the "uploaded a logo, why doesn't it show?" gap. */
  logoUrl?: string | null;
  /** Fix C (r1) — testimonials from the workspace r1 landing row.
   *  Sourced from blueprint_json.payload.testimonials.testimonials.
   *  Empty array → no testimonials block rendered below the calendar. */
  testimonials?: R1Testimonial[];
  /** Section eyebrow label (e.g. "What neighbors say"). */
  testimonialsEyebrow?: string;
  /** Section heading (e.g. "250 reviews. 4.9 stars."). */
  testimonialsHeading?: string;
  /** Aggregate review summary from the r1 payload. */
  testimonialsReviewSummary?: R1TestimonialsSection["reviewSummary"];
}) {
  // v1.40.1 — surface the operator-supplied service hint when the
  // visitor arrived via /book?service=<slug>. Used to pre-display the
  // service they picked at the top of step 3 so they don't worry the
  // operator picked up the wrong appointment type.
  const searchParams = useSearchParams();
  const requestedServiceParam = searchParams?.get("service") ?? null;
  // Prefill from query params (?name=&email=&phone=). Used by the
  // post-checkout "Book onboarding call" link (start/return/page.tsx) so a
  // client who just paid doesn't retype their details. Falls back to empty
  // when the params are absent (the normal public-booking case).
  const prefillName = searchParams?.get("name")?.trim() ?? "";
  const prefillEmail = searchParams?.get("email")?.trim() ?? "";
  const prefillPhone = searchParams?.get("phone")?.trim() ?? "";
  // Pretty-print "botox-dysport-injections" → "Botox Dysport Injections"
  const requestedServiceLabel = requestedServiceParam
    ? requestedServiceParam
        .split(/[-_]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : null;
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState(confirmationFallback);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [step, setStep] = useState<Step>("pick-date");
  const { showDemoToast } = useDemoToast();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const horizon = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + PUBLIC_BOOKING_WINDOW_DAYS);
    return d;
  }, [today]);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const selectedDateISO = useMemo(() => toDateOnly(selectedDate), [selectedDate]);

  // v1.40.2 — display TZ is the WORKSPACE's TZ, not the browser's.
  // Customer's browser TZ doesn't matter — they're booking with an
  // operator who runs hours in a specific local TZ; the picker has
  // to honor that or slots get rejected on submit.
  const timezone = workspaceTimezone;
  const timezoneAbbr = useMemo(() => shortTimezoneAbbr(workspaceTimezone), [workspaceTimezone]);

  useEffect(() => {
    if (step !== "pick-time" || !selectedDateISO) return;

    let cancelled = false;
    setSlotsLoading(true);

    void (async () => {
      const result = await listPublicBookingSlotsAction({
        orgSlug,
        bookingSlug,
        date: selectedDateISO,
      });

      if (cancelled) return;

      setSlots(result.slots);
      if (!result.slots.includes(selectedSlot)) {
        setSelectedSlot("");
      }
      setSlotsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingSlug, orgSlug, selectedDateISO, step]);

  // v1.40.1 — full-name + email + dynamic intake fields tracked in
  // state. `intakeValues` is keyed by field id (e.g. {address: "...",
  // urgency: "Today"}). Submit serializes everything to the action.
  const [fullName, setFullName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  // Seed the `phone` intake field from the prefill param when present. The
  // onboarding-call booking declares a `phone` intake field, so a prefilled
  // phone lands in the right input; harmless for booking types without one.
  const [intakeValues, setIntakeValues] = useState<Record<string, string>>(
    prefillPhone ? { phone: prefillPhone } : {},
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleSubmitClick() {
    setSubmitError(null);
    if (!fullName.trim()) {
      setSubmitError("Please enter your full name.");
      return;
    }
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setSubmitError("Please enter a valid email.");
      return;
    }
    // Validate required intake fields.
    const requiredField = intakeFields.find(
      (f) => f.required && !(intakeValues[f.id] ?? "").trim(),
    );
    if (requiredField) {
      setSubmitError(`Please fill out: ${requiredField.label}`);
      return;
    }

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        // v1.40.1 — separate the universal "notes" field (free-text
        // overflow channel) from the structured intake responses so
        // notes still appears as the legacy field on the booking row,
        // but address/issue/urgency etc. flow as structured data.
        const notesValue = intakeValues.notes ?? "";
        const structuredResponses: Record<string, string> = {};
        for (const [k, v] of Object.entries(intakeValues)) {
          if (k === "notes") continue;
          if (typeof v === "string" && v.trim().length > 0) {
            structuredResponses[k] = v.trim();
          }
        }

        // Auto-include the requested service slug from URL when present —
        // gives operators "they came in for X" context.
        if (requestedServiceParam && !structuredResponses.requested_service) {
          structuredResponses.requested_service = requestedServiceLabel ?? requestedServiceParam;
        }

        const response = await submitPublicBookingAction({
          orgSlug,
          bookingSlug,
          fullName,
          email,
          startsAt: selectedSlot,
          notes: notesValue.trim() || undefined,
          intakeResponses: structuredResponses,
        });

        if (response.checkoutUrl) {
          window.location.assign(response.checkoutUrl);
          return;
        }

        setConfirmationMessage(response.confirmationMessage || confirmationFallback);
        setSuccess(true);
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }
        throw error;
      }
    });
  }

  // ─── Success screen ───────────────────────────────────────────
  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5 py-12" style={{ backgroundColor: "var(--sf-bg, #fafaf9)" }}>
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center" style={{ borderColor: "var(--sf-border)" }}>
          <div className="mx-auto mb-4 inline-flex size-14 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--sf-primary, #21a38b) 15%, transparent)" }}>
            <Check className="size-7" style={{ color: "var(--sf-primary, #21a38b)" }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--sf-text)" }}>You&apos;re booked.</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--sf-muted)" }}>{confirmationMessage}</p>
        </div>
      </main>
    );
  }

  const submitLabel = pending
    ? "Booking…"
    : price > 0
    ? `Pay & book · $${price.toFixed(price % 1 === 0 ? 0 : 2)}`
    : "Confirm booking";

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10" style={{ backgroundColor: "var(--sf-bg, #fafaf9)" }}>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* ───── Minimal header: logo + business name + service title ───── */}
        {/* Fix C: the verbose left info column ("Schedule a service" blurb,
            60 min / On-site / Timezone meta list, "Booking with" eyebrow)
            has been removed. Only essential identity (who you're booking with
            + what appointment) is kept. Calendar is the primary UI.
            Phone CTA is kept for lead-gen value. */}
        <header className="flex items-center justify-between gap-4 border bg-card px-5 py-4 md:px-6" style={{ borderColor: "var(--sf-border)", borderRadius: "var(--sf-radius, 1rem)" }}>
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${businessName} logo`}
                className="h-9 w-auto object-contain shrink-0"
              />
            ) : null}
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight truncate" style={{ color: "var(--sf-text)" }}>
                {businessName}
              </h2>
              <p className="text-sm truncate" style={{ color: "var(--sf-muted)" }}>
                {appointmentName}
              </p>
            </div>
          </div>
          {businessPhone ? (
            <a
              href={toTelLink(businessPhone)}
              className="inline-flex items-center gap-2 rounded-[11px] px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
              style={{
                backgroundColor: "var(--sf-text, #0a0a0a)",
                color: "var(--sf-bg, #ffffff)",
              }}
            >
              <Phone className="size-3.5" />
              <span>{businessPhone}</span>
            </a>
          ) : null}
        </header>

        {/* ───── Body: full-width booking card ───── */}
        {/* Fix C: single-column full-width layout. Calendar is the primary
            element — no side column pushing it right. On mobile this means
            the calendar is immediately visible without scrolling past info. */}
        <div className="border bg-card overflow-hidden" style={{ borderColor: "var(--sf-border)", borderRadius: "var(--sf-radius, 1rem)" }}>
            {/* Booking steps — full width */}
            <section className="p-6 md:p-8 space-y-6 min-w-0">
              <StepIndicator
                steps={[
                  { id: "pick-date", label: "Pick a date" },
                  { id: "pick-time", label: "Choose a time" },
                  { id: "enter-details", label: "Confirm details" },
                ]}
                active={step}
                onClick={(target) => {
                  // Only allow going BACK via clicking earlier steps
                  if (target === "pick-date") {
                    setSelectedSlot("");
                    setStep("pick-date");
                  } else if (target === "pick-time" && step === "enter-details") {
                    setSelectedSlot("");
                    setStep("pick-time");
                  }
                }}
              />

              {/* Step 1 — pick a date */}
              {step === "pick-date" ? (
                <div className="rdp-wrapper">
                  <DayPicker
                    mode="single"
                    required
                    selected={selectedDate}
                    onSelect={(day) => {
                      if (day) {
                        const next = new Date(day);
                        next.setHours(0, 0, 0, 0);
                        setSelectedDate(next);
                        setStep("pick-time");
                      }
                    }}
                    disabled={{ before: today, after: horizon }}
                    showOutsideDays
                  />
                </div>
              ) : null}

              {/* Step 2 — pick a time */}
              {step === "pick-time" ? (
                <div className="space-y-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold" style={{ color: "var(--sf-text)" }}>
                        {formatSelectedDateHeading(selectedDate, timezone)}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--sf-muted)" }}>
                        {durationMinutes}-minute slot · times shown in {timezoneAbbr}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-medium underline underline-offset-2"
                      style={{ color: "var(--sf-muted)" }}
                      onClick={() => setStep("pick-date")}
                    >
                      Change date
                    </button>
                  </div>

                  {slotsLoading ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="h-12 rounded-lg animate-pulse"
                          style={{ backgroundColor: "color-mix(in srgb, var(--sf-text, #0a0a0a) 6%, transparent)" }}
                        />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-12 text-center" style={{ borderColor: "var(--sf-border)" }}>
                      <p className="text-sm font-medium" style={{ color: "var(--sf-text)" }}>No times available.</p>
                      <p className="mt-1 text-xs" style={{ color: "var(--sf-muted)" }}>Try another day.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {slots.map((slot) => {
                        const isSelected = slot === selectedSlot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            className="h-12 rounded-xl border text-sm font-semibold transition-all hover:-translate-y-[1px]"
                            style={{
                              borderColor: isSelected ? "var(--sf-primary, #21a38b)" : "var(--sf-border)",
                              backgroundColor: isSelected
                                ? "color-mix(in srgb, var(--sf-primary, #21a38b) 12%, transparent)"
                                : "var(--sf-card, transparent)",
                              color: isSelected ? "var(--sf-primary, #21a38b)" : "var(--sf-text)",
                            }}
                            onClick={() => {
                              setSelectedSlot(slot);
                              setStep("enter-details");
                            }}
                          >
                            {toTimeLabel(slot, timezone)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Step 3 — enter details. v1.40.1 — custom dynamic form
                   that renders intakeFields per archetype. */}
              {step === "enter-details" && selectedSlot ? (
                <div className="space-y-5">
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border p-4"
                    style={{
                      borderColor: "var(--sf-border)",
                      backgroundColor: "color-mix(in srgb, var(--sf-primary, #21a38b) 6%, transparent)",
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--sf-text)" }}>
                        {formatSelectedDateHeading(selectedDate, timezone)} · {toTimeLabel(selectedSlot, timezone)}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--sf-muted)" }}>
                        {durationMinutes} min · {timezoneAbbr}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium underline underline-offset-2"
                      style={{ color: "var(--sf-muted)" }}
                      onClick={() => {
                        setStep("pick-time");
                        setSelectedSlot("");
                      }}
                    >
                      Change
                    </button>
                  </div>

                  {/* v1.40.1 — show requested service when the visitor came
                       in via /book?service=<slug>. Lets the operator see
                       which menu item the customer clicked. */}
                  {requestedServiceLabel ? (
                    <div
                      className="rounded-xl border p-4"
                      style={{
                        borderColor: "var(--sf-border)",
                        backgroundColor: "var(--sf-card-bg, #fafafa)",
                      }}
                    >
                      <p className="text-[11px] uppercase tracking-[0.12em] font-semibold" style={{ color: "var(--sf-muted)" }}>
                        Service requested
                      </p>
                      <p className="mt-1 text-sm font-semibold" style={{ color: "var(--sf-text)" }}>
                        {requestedServiceLabel}
                      </p>
                    </div>
                  ) : null}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSubmitClick();
                    }}
                    className="space-y-4"
                  >
                    <FieldShell label="Full name" required>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="crm-input h-11 w-full"
                        autoComplete="name"
                      />
                    </FieldShell>
                    <FieldShell label="Email" required>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="crm-input h-11 w-full"
                        autoComplete="email"
                      />
                    </FieldShell>

                    {/* v1.40.1 — vertical-aware intake fields. Renders
                         dynamically based on archetype-supplied schema. */}
                    {intakeFields.map((field) => (
                      <DynamicIntakeField
                        key={field.id}
                        field={field}
                        value={intakeValues[field.id] ?? ""}
                        onChange={(v) =>
                          setIntakeValues((prev) => ({ ...prev, [field.id]: v }))
                        }
                      />
                    ))}

                    {submitError ? (
                      <p
                        className="text-sm"
                        style={{ color: "#dc2626" }}
                        role="alert"
                      >
                        {submitError}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={pending}
                      className="crm-button-primary h-12 w-full justify-center text-base font-semibold disabled:opacity-60"
                      style={{
                        // 2026-05-18 — radius cascade from theme:
                        // sharp / rounded / pill via --sf-radius. The
                        // primary button is the most-clicked element
                        // on the booking page; honoring radius here
                        // makes the operator's choice visibly land.
                        borderRadius: "var(--sf-radius, 0.5rem)",
                        // Accent rendering on hover/focus is too
                        // disruptive on the primary CTA — keep primary
                        // bg, but use accent color as a focus-ring
                        // tint via outlineColor.
                        outlineColor: "var(--sf-accent, var(--sf-primary, #21a38b))",
                      }}
                    >
                      {submitLabel}
                    </button>
                  </form>
                </div>
              ) : null}
            </section>
        </div>

        {/* ───── Testimonials (Fix C — r1 source) ───── */}
        {/* Sourced from landing_pages.blueprint_json.payload.testimonials.testimonials
            (the r1 landing row) so the booking page shows the same social proof
            as the live website. Renders nothing when the workspace has no r1 row
            or the testimonials array is empty. */}
        {testimonials.length > 0 ? (
          <div className="space-y-4 pb-4">
            {/* Section header: eyebrow label + optional review summary */}
            <div className="text-center space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--sf-muted)" }}>
                {testimonialsEyebrow ?? "What customers say"}
              </p>
              {testimonialsHeading ? (
                <p className="text-base font-semibold" style={{ color: "var(--sf-text)" }}>
                  {testimonialsHeading}
                </p>
              ) : null}
              {testimonialsReviewSummary ? (
                <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
                  {testimonialsReviewSummary.rating}★ · {testimonialsReviewSummary.count} reviews
                  {testimonialsReviewSummary.sources ? ` · ${testimonialsReviewSummary.sources}` : ""}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {testimonials.map((t) => {
                const subtitle = [t.city, t.service].filter(Boolean).join(" · ");
                const rating = typeof t.rating === "number" ? t.rating : 0;
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border p-5 space-y-3"
                    style={{
                      borderColor: "var(--sf-border)",
                      backgroundColor: "var(--sf-card, transparent)",
                      borderRadius: "var(--sf-radius, 1rem)",
                    }}
                  >
                    {rating > 0 ? (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, idx) => (
                          <Star
                            key={idx}
                            className="size-3.5"
                            style={{
                              color: idx < rating ? "var(--sf-primary, #21a38b)" : "color-mix(in srgb, var(--sf-text, #0a0a0a) 20%, transparent)",
                              fill: idx < rating ? "var(--sf-primary, #21a38b)" : "none",
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                    <p className="text-sm leading-relaxed" style={{ color: "var(--sf-text)" }}>
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--sf-text)" }}>
                        {t.name}
                      </p>
                      {subtitle ? (
                        <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
                          {subtitle}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* DayPicker styling overrides — match the brand and tighten layout.
          Using a plain dangerouslySetInnerHTML <style> rather than styled-jsx
          so we don't pull in next/styled-jsx as a dependency. */}
      <style dangerouslySetInnerHTML={{ __html: dayPickerCss }} />
    </main>
  );
}

const dayPickerCss = `
.rdp-wrapper .rdp {
  --rdp-cell-size: 44px;
  --rdp-accent-color: var(--sf-primary, #21a38b);
  --rdp-background-color: color-mix(in srgb, var(--sf-primary, #21a38b) 12%, transparent);
  --rdp-accent-color-dark: var(--sf-primary, #21a38b);
  --rdp-background-color-dark: color-mix(in srgb, var(--sf-primary, #21a38b) 24%, transparent);
  --rdp-outline: 2px solid var(--sf-primary, #21a38b);
  --rdp-outline-selected: 2px solid var(--sf-primary, #21a38b);
  margin: 0;
}
.rdp-wrapper .rdp-caption_label {
  font-weight: 600;
  font-size: 16px;
  color: var(--sf-text);
}
.rdp-wrapper .rdp-head_cell {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sf-muted);
}
.rdp-wrapper .rdp-day {
  font-size: 14px;
  font-weight: 500;
  color: var(--sf-text);
  border-radius: 10px;
  transition: all 120ms ease;
}
.rdp-wrapper .rdp-day_selected {
  background-color: var(--sf-primary, #21a38b);
  color: white;
  font-weight: 600;
}
.rdp-wrapper .rdp-day_today:not(.rdp-day_selected) {
  color: var(--sf-primary, #21a38b);
  font-weight: 600;
}
.rdp-wrapper .rdp-day_disabled {
  color: color-mix(in srgb, var(--sf-text, #0a0a0a) 30%, transparent);
}
.rdp-wrapper .rdp-day:hover:not(.rdp-day_disabled):not(.rdp-day_selected) {
  background-color: color-mix(in srgb, var(--sf-primary, #21a38b) 10%, transparent);
}
.rdp-wrapper .rdp-nav_button {
  color: var(--sf-text);
}
`;

// ─── Helpers ──────────────────────────────────────────────────────

// v1.40.1 — wraps a label + input with consistent SF spacing.
function FieldShell({
  label,
  required,
  helpText,
  children,
}: {
  label: string;
  required?: boolean;
  helpText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: "var(--sf-text)" }}>
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {helpText ? (
        <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
          {helpText}
        </p>
      ) : null}
    </div>
  );
}

// v1.40.1 — renders a single archetype-defined intake field. Dispatches
// on field.type to the appropriate input element. value/onChange are
// controlled by the parent form's intakeValues state.
function DynamicIntakeField({
  field,
  value,
  onChange,
}: {
  field: BookingIntakeField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "textarea") {
    return (
      <FieldShell label={field.label} required={field.required} helpText={field.helpText}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder}
          rows={3}
          className="crm-input w-full px-3 py-2"
        />
      </FieldShell>
    );
  }
  if (field.type === "select") {
    return (
      <FieldShell label={field.label} required={field.required} helpText={field.helpText}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="crm-input h-11 w-full"
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </FieldShell>
    );
  }
  if (field.type === "radio") {
    return (
      <FieldShell label={field.label} required={field.required} helpText={field.helpText}>
        <div className="grid gap-2 sm:grid-cols-2">
          {(field.options ?? []).map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/30"
              style={{ borderColor: "var(--sf-border)" }}
            >
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                onChange={(e) => onChange(e.target.value)}
                required={field.required}
                className="size-4"
              />
              <span style={{ color: "var(--sf-text)" }}>{opt}</span>
            </label>
          ))}
        </div>
      </FieldShell>
    );
  }
  // tel + text default to a single-line input
  return (
    <FieldShell label={field.label} required={field.required} helpText={field.helpText}>
      <input
        type={field.type === "tel" ? "tel" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        placeholder={field.placeholder}
        autoComplete={field.type === "tel" ? "tel" : "off"}
        className="crm-input h-11 w-full"
      />
    </FieldShell>
  );
}

function StepIndicator<T extends string>({
  steps,
  active,
  onClick,
}: {
  steps: Array<{ id: T; label: string }>;
  active: T;
  onClick: (id: T) => void;
}) {
  const activeIdx = steps.findIndex((s) => s.id === active);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((s, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        const baseStyles: React.CSSProperties = isActive
          ? {
              backgroundColor: "var(--sf-primary, #21a38b)",
              color: "white",
            }
          : isPast
          ? {
              backgroundColor: "color-mix(in srgb, var(--sf-primary, #21a38b) 15%, transparent)",
              color: "var(--sf-primary, #21a38b)",
              cursor: "pointer",
            }
          : {
              backgroundColor: "color-mix(in srgb, var(--sf-text, #0a0a0a) 6%, transparent)",
              color: "var(--sf-muted)",
            };
        return (
          <button
            key={s.id}
            type="button"
            disabled={!isPast && !isActive}
            onClick={() => isPast && onClick(s.id)}
            className="inline-flex items-center gap-2 rounded-[11px] px-3.5 py-1.5 text-xs font-semibold transition-colors"
            style={baseStyles}
          >
            <span
              className="inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: isActive ? "rgba(255,255,255,0.25)" : "transparent",
                color: isActive ? "white" : "currentColor",
                border: isActive || isPast ? "none" : "1px solid currentColor",
              }}
            >
              {isPast ? <Check className="size-3" /> : i + 1}
            </span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
