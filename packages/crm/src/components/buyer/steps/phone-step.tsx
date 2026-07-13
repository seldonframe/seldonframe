"use client";

// Marketplace buyer surface — the phone step (BYO forward vs. get a number).
//
// A voice agent needs a number to answer on, so the engine adds this REQUIRED
// step for a voice surface (go-live is gated on it). Two paths, ported STRUCTURE
// from the Claude Design export's "Your phone" screen and re-skinned to the brand
// (teal #059669, cream, accent-soft cards — no violet):
//
//   • "Forward my existing number" (BYO) — the buyer keeps the number customers
//     already know. They type it naturally ("(602) 555-0148"); we normalize to
//     E.164 (normalizeUsPhoneToE164) and call activateDeploymentAction, which
//     records the number on the deployment. Then we show the "we'll text you the
//     forwarding steps" confirmation.
//   • "Get a new number" — provisionDeploymentNumberAction buys a fresh local
//     number in the buyer's Twilio (by area code) and shows it.
//
// Either path leaves a number present on the deployment; once the buyer continues
// the wizard marks `phone` done (clearing the go-live blocker). If a number is
// ALREADY on the deployment (resume), we open straight into the matching
// confirmation. The step owns its own footer.

import { useState, useTransition } from "react";

import { BUYER } from "@/components/buyer/theme";
import {
  activateDeploymentAction,
  provisionDeploymentNumberAction,
} from "@/lib/deployments/actions";
import { normalizeUsPhoneToE164 } from "@/lib/marketplace/buyer/buyer-onboarding";

export type PhoneSeed = {
  /** The deployment's current E.164 number, if any (resume). */
  phoneNumber: string | null;
  /** How it was acquired ('provisioned' | 'byo' | null). */
  numberOrigin: string | null;
  /** Default area code (from the buyer's contact phone) for "Get a number". */
  defaultAreaCode: string;
  /** Whether the agent (a voice surface) requires a number — drives the copy. */
  required: boolean;
};

export type PhoneStepProps = {
  deploymentId: string;
  seed: PhoneSeed;
  canGoBack: boolean;
  onBack: () => void;
  /** Record the step done + advance (the generic wizard path). */
  onContinue: () => void;
};

type Mode = "choose" | "forward" | "new";

/** "+16025550148" → "(602) 555-0148" for display; non-NANP returned as-is. */
function prettyPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function PhoneStep({ deploymentId, seed, canGoBack, onBack, onContinue }: PhoneStepProps) {
  // Resume: if a number is already set, open into the matching confirmation.
  const initialMode: Mode = seed.phoneNumber
    ? seed.numberOrigin === "provisioned"
      ? "new"
      : "forward"
    : "choose";
  const [mode, setMode] = useState<Mode>(initialMode);

  // BYO forward state.
  const [forwardInput, setForwardInput] = useState(
    seed.phoneNumber && seed.numberOrigin !== "provisioned" ? prettyPhone(seed.phoneNumber) : "",
  );
  const [savedForward, setSavedForward] = useState<string | null>(
    seed.phoneNumber && seed.numberOrigin !== "provisioned" ? seed.phoneNumber : null,
  );
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [savingForward, startForward] = useTransition();

  // Get-a-number state.
  const [areaCode, setAreaCode] = useState(seed.defaultAreaCode);
  const [provisioned, setProvisioned] = useState<string | null>(
    seed.phoneNumber && seed.numberOrigin === "provisioned" ? seed.phoneNumber : null,
  );
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisioning, startProvision] = useTransition();

  const areaCodeValid = /^[2-9]\d{2}$/.test(areaCode.trim());
  // A number is present once either path has set one (or one was already on the
  // deployment) — gates the footer "Continue" so a voice agent never advances
  // past a required phone step with no line.
  const hasNumber = Boolean(savedForward || provisioned || seed.phoneNumber);

  function handleForward() {
    setForwardError(null);
    const e164 = normalizeUsPhoneToE164(forwardInput);
    if (!e164) {
      setForwardError("Enter your business number, e.g. (602) 555-0148.");
      return;
    }
    startForward(async () => {
      const r = await activateDeploymentAction({ deploymentId, phoneNumber: e164 });
      if (r.ok) {
        setSavedForward(e164);
        return;
      }
      setForwardError(
        r.error === "invalid_phone"
          ? "That number doesn’t look right — please re-check it."
          : r.error === "phone_in_use"
            ? "That number is already connected to another agent."
            : r.error === "not_found"
              ? "We couldn’t find your agent."
              : "Couldn’t save your number — please try again.",
      );
    });
  }

  function handleProvision() {
    setProvisionError(null);
    startProvision(async () => {
      const r = await provisionDeploymentNumberAction({ deploymentId, areaCode: areaCode.trim() });
      if (r.ok) {
        if ("phoneNumber" in r) setProvisioned(r.phoneNumber);
        return;
      }
      setProvisionError(provisionErrorCopy(r.error));
    });
  }

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={hHeading}>Your phone</h2>
        <p style={hSub}>How should callers reach your agent?</p>
      </div>

      {/* ── choose path ─────────────────────────────────────────────────────── */}
      {mode === "choose" ? (
        <div style={cardGrid}>
          <button type="button" onClick={() => setMode("forward")} style={choiceCard}>
            <div style={choiceIcon}>⤺</div>
            <div style={choiceTitle}>Forward my existing number</div>
            <div style={choiceBody}>
              Keep the number customers already know. We send simple steps.
            </div>
          </button>
          <button type="button" onClick={() => setMode("new")} style={choiceCard}>
            <div style={choiceIcon}>☎</div>
            <div style={choiceTitle}>Get a new number</div>
            <div style={choiceBody}>
              We give you a fresh local number in seconds. Ready instantly.
            </div>
          </button>
        </div>
      ) : null}

      {/* ── forward path ────────────────────────────────────────────────────── */}
      {mode === "forward" ? (
        <div style={panel}>
          <div style={panelHead}>
            <span style={panelIcon}>⤺</span>
            <span style={panelTitle}>Forward your number</span>
          </div>

          {savedForward ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ color: BUYER.positive, fontSize: 14, fontWeight: 600 }}>✓ Saved</span>
                <span style={{ fontFamily: BUYER.fontMono, fontSize: 16, fontWeight: 600 }}>
                  {prettyPhone(savedForward)}
                </span>
              </div>
              <p style={panelNote}>
                We’ll text you 3 simple steps to forward calls when you’re
                unavailable. Takes about a minute.
              </p>
            </>
          ) : (
            <>
              <label style={fieldLabel}>Your business number</label>
              <input
                className="sf-buyer-input"
                placeholder="(602) 555-0148"
                value={forwardInput}
                onChange={(e) => setForwardInput(e.target.value)}
                disabled={savingForward}
                style={{ ...inputStyle, fontFamily: BUYER.fontMono }}
                aria-label="Your business number"
                inputMode="tel"
              />
              <button
                type="button"
                onClick={handleForward}
                disabled={savingForward}
                style={{ ...navBtnPrimary, width: "100%", justifyContent: "center", marginTop: 12 }}
              >
                {savingForward ? "Saving…" : "Save my number"}
              </button>
              {forwardError ? (
                <p role="alert" style={errStyle}>
                  {forwardError}
                </p>
              ) : null}
            </>
          )}
          <button type="button" onClick={() => resetTo("choose")} style={changeLink}>
            Choose a different option
          </button>
        </div>
      ) : null}

      {/* ── get-a-number path ───────────────────────────────────────────────── */}
      {mode === "new" ? (
        <div style={panel}>
          <div style={panelHead}>
            <span style={panelIcon}>☎</span>
            <span style={panelTitle}>
              {provisioned ? "Your new number is ready" : "Get a new number"}
            </span>
          </div>

          {provisioned ? (
            <>
              <div style={numberPlate}>
                <span style={{ fontFamily: BUYER.fontMono, fontSize: 22, fontWeight: 600 }}>
                  {prettyPhone(provisioned)}
                </span>
              </div>
              <p style={panelNote}>
                A local number, active now. Put it on your site and Google listing
                whenever you’re ready.
              </p>
            </>
          ) : (
            <>
              <label style={fieldLabel}>Pick a local area code</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="sf-buyer-input"
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="602"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  disabled={provisioning}
                  style={{ ...inputStyle, width: 96, fontFamily: BUYER.fontMono, textAlign: "center" }}
                  aria-label="Area code"
                />
                <button
                  type="button"
                  onClick={handleProvision}
                  disabled={provisioning || !areaCodeValid}
                  style={{
                    ...navBtnPrimary,
                    flex: 1,
                    justifyContent: "center",
                    opacity: provisioning || !areaCodeValid ? 0.5 : 1,
                    cursor: provisioning || !areaCodeValid ? "not-allowed" : "pointer",
                  }}
                >
                  {provisioning ? "Getting your number…" : "Get a number"}
                </button>
              </div>
              {provisionError ? (
                <p role="alert" style={errStyle}>
                  {provisionError}
                </p>
              ) : null}
            </>
          )}
          <button type="button" onClick={() => resetTo("choose")} style={changeLink}>
            Choose a different option
          </button>
        </div>
      ) : null}

      {/* ── footer ──────────────────────────────────────────────────────────── */}
      <div style={footerRow}>
        {canGoBack ? (
          <button type="button" onClick={onBack} style={navBtnGhost}>
            ← Back
          </button>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={!hasNumber}
          style={{
            ...navBtnPrimary,
            opacity: hasNumber ? 1 : 0.5,
            cursor: hasNumber ? "pointer" : "not-allowed",
          }}
          title={hasNumber ? undefined : "Set up a number to continue"}
        >
          Continue →
        </button>
      </div>
    </div>
  );

  // ── locals (closures over state) ──────────────────────────────────────────
  function resetTo(next: Mode) {
    setForwardError(null);
    setProvisionError(null);
    setMode(next);
  }
}

// ─── styles (BUYER tokens) ───────────────────────────────────────────────────

const hHeading: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 21,
  fontWeight: 650,
  letterSpacing: "-0.018em",
};
const hSub: React.CSSProperties = {
  margin: "0 auto",
  maxWidth: 400,
  fontSize: 15,
  color: BUYER.ink2,
  lineHeight: 1.5,
};
const cardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
};
const choiceCard: React.CSSProperties = {
  textAlign: "left",
  padding: 22,
  borderRadius: 18,
  background: BUYER.card,
  border: `1.5px solid ${BUYER.line}`,
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  display: "block",
};
const choiceIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 46,
  height: 46,
  borderRadius: 13,
  background: BUYER.accentSoft,
  color: BUYER.accent,
  marginBottom: 14,
  fontSize: 22,
};
const choiceTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 650,
  marginBottom: 4,
  color: BUYER.ink,
};
const choiceBody: React.CSSProperties = {
  fontSize: 13.5,
  color: BUYER.ink2,
  lineHeight: 1.45,
};
const panel: React.CSSProperties = {
  padding: 20,
  borderRadius: 18,
  background: BUYER.accentSoft,
  border: `1px solid ${BUYER.accentSoft2}`,
};
const panelHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 14,
};
const panelIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 38,
  height: 38,
  borderRadius: 11,
  background: BUYER.card,
  color: BUYER.accent,
  fontSize: 18,
};
const panelTitle: React.CSSProperties = { fontSize: 16, fontWeight: 650, color: BUYER.ink };
const panelNote: React.CSSProperties = {
  margin: "13px 0 0",
  fontSize: 13,
  color: BUYER.ink2,
  lineHeight: 1.5,
};
const numberPlate: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "16px 18px",
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  borderRadius: 14,
  flexWrap: "wrap",
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
  color: BUYER.ink,
  background: BUYER.card,
  border: `1px solid ${BUYER.lineStrong}`,
  borderRadius: 12,
  outline: "none",
  boxSizing: "border-box",
};
const changeLink: React.CSSProperties = {
  marginTop: 12,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  fontSize: 13.5,
  fontWeight: 600,
  color: BUYER.accent,
  padding: 0,
  display: "block",
};
const errStyle: React.CSSProperties = {
  margin: "12px 0 0",
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

/** Map a provision-action error code to buyer-facing copy. */
function provisionErrorCopy(error: string): string {
  switch (error) {
    case "no_numbers_available":
      return "No numbers free in that area code — try another.";
    case "phone_in_use":
      return "That number is already connected to another agent.";
    case "needs_telephony":
      return "Phone numbers aren’t set up on your account yet — contact support.";
    case "invalid_area_code":
      return "Enter a 3-digit area code — e.g. 602.";
    case "not_found":
    case "deployment_not_found":
      return "We couldn’t find your agent.";
    case "unauthorized":
      return "You don’t have access to this agent.";
    default:
      return "Couldn’t get a number — please try again.";
  }
}
