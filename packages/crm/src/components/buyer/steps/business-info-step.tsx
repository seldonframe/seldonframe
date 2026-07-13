"use client";

// Marketplace buyer surface — the business_info step.
//
// The first "tell us about you" screen for a non-social agent: the business
// name (the one required field — it's what the agent calls the business),
// what-you-do, a repeatable services+prices list, and a single open/close hours
// window. Ported STRUCTURE from the Claude Design onboarding export's "About your
// business" screen (label stack, accent-soft hours pill, "Add a service"), but
// re-skinned to the real brand via the BUYER tokens (teal `#059669`, cream paper,
// DM Mono for the price + time fields) — none of the export's violet.
//
// On save it calls the buyer `saveBusinessInfoAction`, which validates via the
// pure `validateBusinessInfo`, writes `customization.businessInfo` + `services` +
// the structured Mon–Fri `bookingPolicy.hours`, and marks `business_info` done.
// On success the wizard advances. It owns its OWN footer (Back + the validating
// "Continue" submit) — the generic wizard footer is suppressed for this kind.

import { useState, useTransition } from "react";

import { BUYER } from "@/components/buyer/theme";
import { saveBusinessInfoAction } from "@/app/(buyer)/agent/actions";
import type { BusinessInfoServiceInput } from "@/lib/marketplace/buyer/buyer-onboarding";

/** A service row in local edit state (always has an id for a stable React key). */
type ServiceRow = { id: number; name: string; price: string };

export type BusinessInfoSeed = {
  /** Prefilled business name (from `customization.businessInfo.name`). */
  name: string;
  /** Prefilled "what you do" (from `customization.businessInfo` description, if any). */
  whatYouDo: string;
  /** Prefilled service lines (from `customization.services`). */
  services: BusinessInfoServiceInput[];
  /** Prefilled hours window as HH:MM 24h strings (derived from the booking policy). */
  hoursOpen: string;
  hoursClose: string;
};

export type BusinessInfoStepProps = {
  deploymentId: string;
  seed: BusinessInfoSeed;
  /** Whether a Back affordance is shown (false on the very first step). */
  canGoBack: boolean;
  /** Step back one screen (no save). */
  onBack: () => void;
  /** Called after the action succeeds — the wizard records progress + advances. */
  onSaved: () => void;
};

let nextRowId = 1;
function seedRows(services: BusinessInfoServiceInput[]): ServiceRow[] {
  const rows = services.map((s) => ({
    id: nextRowId++,
    name: s.name ?? "",
    price: s.price ?? "",
  }));
  // Always show at least one (empty) row so the buyer has somewhere to type.
  return rows.length > 0 ? rows : [{ id: nextRowId++, name: "", price: "" }];
}

export function BusinessInfoStep({
  deploymentId,
  seed,
  canGoBack,
  onBack,
  onSaved,
}: BusinessInfoStepProps) {
  const [name, setName] = useState(seed.name);
  const [whatYouDo, setWhatYouDo] = useState(seed.whatYouDo);
  const [services, setServices] = useState<ServiceRow[]>(() => seedRows(seed.services));
  const [hoursOpen, setHoursOpen] = useState(seed.hoursOpen);
  const [hoursClose, setHoursClose] = useState(seed.hoursClose);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function updateRow(id: number, patch: Partial<ServiceRow>) {
    setServices((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setServices((rows) => [...rows, { id: nextRowId++, name: "", price: "" }]);
  }
  function removeRow(id: number) {
    setServices((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));
  }

  function handleSubmit() {
    setError(null);
    startSaving(async () => {
      const result = await saveBusinessInfoAction(deploymentId, {
        name,
        whatYouDo,
        services: services.map((r) => ({ name: r.name, price: r.price })),
        hoursOpen: hoursOpen.trim() || undefined,
        hoursClose: hoursClose.trim() || undefined,
      });
      if (result.ok) {
        onSaved();
        return;
      }
      setError(
        result.error === "name_required"
          ? "Add your business name — it’s what your agent calls you."
          : result.error === "invalid_hours"
            ? "Check your hours — enter a valid open and close time (open earlier than close)."
            : result.error === "unauthorized"
              ? "You don’t have access to this agent."
              : result.error === "not_found"
                ? "We couldn’t find your agent."
                : "Couldn’t save — please try again.",
      );
    });
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={hHeading}>About your business</h2>
        <p style={hSub}>
          This is what your agent tells callers. Keep it simple — you can change it
          anytime.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Business name — the required field. */}
        <Field label="Business name" required>
          <input
            className="sf-buyer-input"
            placeholder="Northgate Plumbing"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            style={inputStyle}
            aria-label="Business name"
            autoFocus
          />
        </Field>

        {/* What you do. */}
        <Field label="What you do">
          <input
            className="sf-buyer-input"
            placeholder="Plumbing & drain repair"
            value={whatYouDo}
            onChange={(e) => setWhatYouDo(e.target.value)}
            disabled={saving}
            style={inputStyle}
            aria-label="What you do"
          />
        </Field>

        {/* Services & prices — repeatable. */}
        <Field label="Services & prices">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {services.map((row) => (
              <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="sf-buyer-input"
                  placeholder="Drain cleaning"
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  disabled={saving}
                  style={{ ...inputStyle, flex: 1 }}
                  aria-label="Service name"
                />
                <input
                  className="sf-buyer-input"
                  placeholder="$140"
                  value={row.price}
                  onChange={(e) => updateRow(row.id, { price: e.target.value })}
                  disabled={saving}
                  style={{ ...inputStyle, width: 96, fontFamily: BUYER.fontMono }}
                  aria-label="Service price"
                />
                {services.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={saving}
                    aria-label="Remove service"
                    style={removeBtn}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            <button type="button" onClick={addRow} disabled={saving} style={addServiceBtn}>
              + Add a service
            </button>
          </div>
        </Field>

        {/* Hours — a single open/close window (→ Mon–Fri booking hours). */}
        <Field label="Hours">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={hoursPill}>Business hours</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flex: 1,
                minWidth: 200,
              }}
            >
              <input
                type="time"
                value={hoursOpen}
                onChange={(e) => setHoursOpen(e.target.value)}
                disabled={saving}
                style={{ ...inputStyle, flex: 1, fontFamily: BUYER.fontMono, textAlign: "center" }}
                aria-label="Opening time"
              />
              <span style={{ color: BUYER.ink3, fontSize: 14 }}>to</span>
              <input
                type="time"
                value={hoursClose}
                onChange={(e) => setHoursClose(e.target.value)}
                disabled={saving}
                style={{ ...inputStyle, flex: 1, fontFamily: BUYER.fontMono, textAlign: "center" }}
                aria-label="Closing time"
              />
            </div>
          </div>
        </Field>
      </div>

      {error ? (
        <p role="alert" style={errStyle}>
          {error}
        </p>
      ) : null}

      {/* Own footer — Back (when applicable) + the validating primary submit. */}
      <div style={footerRow}>
        {canGoBack ? (
          <button type="button" onClick={onBack} disabled={saving} style={navBtnGhost}>
            ← Back
          </button>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <button type="button" onClick={handleSubmit} disabled={saving} style={navBtnPrimary}>
          {saving ? "Saving…" : "Continue →"}
        </button>
      </div>
    </div>
  );
}

// ─── small presentational helpers ────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={fieldLabel}>
        {label}
        {required ? <span style={{ color: BUYER.accent, marginLeft: 4 }}>*</span> : null}
      </label>
      {children}
    </div>
  );
}

// ─── inline styles (BUYER tokens; teal + cream, never violet) ────────────────

const hHeading: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 21,
  fontWeight: 650,
  letterSpacing: "-0.018em",
};
const hSub: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  color: BUYER.ink2,
  lineHeight: 1.5,
};
const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: BUYER.ink2,
  marginBottom: 7,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 13px",
  fontSize: 14,
  fontFamily: BUYER.fontSans,
  color: BUYER.ink,
  background: BUYER.card,
  border: `1px solid ${BUYER.lineStrong}`,
  borderRadius: 12,
  outline: "none",
  boxSizing: "border-box",
};
const hoursPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 15px",
  background: BUYER.accentSoft,
  border: `1px solid ${BUYER.accent}`,
  borderRadius: 14,
  fontSize: 14,
  fontWeight: 600,
  color: BUYER.accentInk,
};
const addServiceBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  fontSize: 14,
  fontWeight: 600,
  color: BUYER.accent,
  padding: "4px 0",
};
const removeBtn: React.CSSProperties = {
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: 8,
  border: `1px solid ${BUYER.line}`,
  background: BUYER.card,
  color: BUYER.ink3,
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
};
const errStyle: React.CSSProperties = {
  margin: "16px 0 0",
  fontSize: 13.5,
  color: "#B4302A",
  fontWeight: 550,
};
const footerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 24,
};
const navBtnPrimary: React.CSSProperties = {
  fontFamily: BUYER.fontSans,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 48,
  padding: "0 22px",
  borderRadius: 14,
  border: "none",
  background: BUYER.accent,
  color: BUYER.accentContrast,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: BUYER.shadowAccent,
};
const navBtnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  fontSize: 15,
  fontWeight: 550,
  color: BUYER.ink2,
  padding: "10px 4px",
};
