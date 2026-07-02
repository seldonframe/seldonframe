"use client";

// Marketplace buyer surface — the connect_openai_voice step (Tier 2 opt-in).
//
// Voice-only, SKIPPABLE, advanced screen: "bring your own OpenAI voice
// project" for $0 SF fees on this agent's calls (spec 2026-07-01 §5, Task 9).
// Most buyers skip this — it's for a builder who already has (or wants) their
// own OpenAI project and wants calls to run on THEIR key rather than SF's
// metered rate. Framed plainly as optional/advanced so it never reads as a
// required setup step.
//
// Three instructions mirror exactly what the buyer needs to do in their own
// OpenAI dashboard (Settings→General for the project id, Settings→Webhooks to
// register the URL shown here, then copy the signing secret), three inputs,
// submit → `connectOpenAiVoiceAction` (org-scoped — writes
// organizations.integrations.openaiVoice + best-effort points a connected BYO
// Twilio trunk at this project's SIP endpoint). Success shows the trunk
// outcome; SKIPPED here always still lets the buyer continue (never a
// go-live blocker — the engine marks this step `required: false`).
//
// Ported STYLE from the sibling rich steps (ConnectToolStep's icon-wrap +
// why-line, PhoneStep's labeled-input pattern) — no new visual language.

import { useState, useTransition } from "react";

import { BUYER } from "@/components/buyer/theme";
import { connectOpenAiVoiceAction } from "@/lib/telephony/connect-openai-voice";

export type ConnectOpenAiVoiceSeed = {
  /** Whether the org already has Tier-2 credentials stored (resume: skip
   *  straight to the connected state). */
  connected: boolean;
  /** This org's per-org webhook URL, shown for the buyer to paste into their
   *  OpenAI dashboard's Settings→Webhooks. Always present (derived from
   *  orgId), even before the org has connected anything. */
  webhookUrl: string;
};

export type ConnectOpenAiVoiceStepProps = {
  seed: ConnectOpenAiVoiceSeed;
  canGoBack: boolean;
  onBack: () => void;
  /** Record the step done + advance (the generic wizard path) — used by
   *  Connect, Skip, and the already-connected Continue alike. */
  onContinue: () => void;
};

export function ConnectOpenAiVoiceStep({
  seed,
  canGoBack,
  onBack,
  onContinue,
}: ConnectOpenAiVoiceStepProps) {
  const [connected, setConnected] = useState(seed.connected);
  const [trunkNote, setTrunkNote] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, startConnecting] = useTransition();

  function handleConnect() {
    setError(null);
    startConnecting(async () => {
      const r = await connectOpenAiVoiceAction({
        projectId: projectId.trim(),
        apiKey: apiKey.trim(),
        webhookSecret: webhookSecret.trim(),
      });
      if (r.ok) {
        setConnected(true);
        setTrunkNote(
          r.trunk === "ok"
            ? "Your Twilio trunk now points at this project too."
            : r.trunk === "failed"
              ? "Saved — we couldn’t point your Twilio trunk automatically. You can retry this later."
              : "Saved. Connect Twilio first if you also want your number routed here.",
        );
        return;
      }
      setError(
        r.error === "unauthorized"
          ? "You don’t have access to this agent."
          : "Check the values you pasted — one of them doesn’t look right.",
      );
    });
  }

  // ── CONNECTED: success state ────────────────────────────────────────────────
  if (connected) {
    return (
      <div style={{ textAlign: "center" }}>
        <div aria-hidden style={{ ...iconWrap, background: BUYER.posSoft, color: BUYER.positive }}>
          ✓
        </div>
        <h2 style={hHeading}>Your OpenAI voice project is connected</h2>
        <p style={hSub}>
          {trunkNote ?? "Calls can now run on your own OpenAI project — $0 SF fees."}
        </p>

        <div style={{ ...footerRow, justifyContent: canGoBack ? "space-between" : "flex-end" }}>
          {canGoBack ? (
            <button type="button" onClick={onBack} style={navBtnGhost}>
              ← Back
            </button>
          ) : null}
          <button type="button" onClick={onContinue} style={navBtnPrimary}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── NOT CONNECTED ───────────────────────────────────────────────────────────
  return (
    <div style={{ textAlign: "center" }}>
      <div aria-hidden style={iconWrap}>
        ✦
      </div>
      <h2 style={hHeading}>Connect your OpenAI voice project</h2>
      <p style={hSub}>
        Optional, for advanced builders: bring your own OpenAI project and this
        agent&rsquo;s calls run on YOUR key, at $0 SF fees. Most people skip this.
      </p>

      <div style={{ ...instructionsCard, textAlign: "left" }}>
        <ol style={instructionsList}>
          <li>
            In your OpenAI dashboard, go to <strong>Settings → General</strong> and copy your{" "}
            <span style={mono}>project_id</span>.
          </li>
          <li>
            Go to <strong>Settings → Webhooks</strong> and register this URL:
            <div style={urlPlate}>
              <span style={{ ...mono, fontSize: 12.5 }}>{seed.webhookUrl}</span>
            </div>
          </li>
          <li>
            Copy the webhook&rsquo;s signing secret (it starts with{" "}
            <span style={mono}>whsec_</span>).
          </li>
        </ol>
      </div>

      <div style={{ textAlign: "left", maxWidth: 420, margin: "0 auto" }}>
        <label style={fieldLabel}>Project ID</label>
        <input
          className="sf-buyer-input"
          placeholder="proj_..."
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={connecting}
          style={{ ...inputStyle, fontFamily: BUYER.fontMono, marginBottom: 12 }}
          aria-label="OpenAI project ID"
        />
        <label style={fieldLabel}>API key</label>
        <input
          className="sf-buyer-input"
          type="password"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={connecting}
          style={{ ...inputStyle, fontFamily: BUYER.fontMono, marginBottom: 12 }}
          aria-label="OpenAI API key"
        />
        <label style={fieldLabel}>Webhook signing secret</label>
        <input
          className="sf-buyer-input"
          type="password"
          placeholder="whsec_..."
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          disabled={connecting}
          style={{ ...inputStyle, fontFamily: BUYER.fontMono }}
          aria-label="OpenAI webhook signing secret"
        />

        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting || !projectId.trim() || !apiKey.trim() || !webhookSecret.trim()}
          style={{
            ...navBtnPrimary,
            width: "100%",
            justifyContent: "center",
            marginTop: 16,
            opacity: connecting || !projectId.trim() || !apiKey.trim() || !webhookSecret.trim() ? 0.5 : 1,
            cursor:
              connecting || !projectId.trim() || !apiKey.trim() || !webhookSecret.trim()
                ? "not-allowed"
                : "pointer",
          }}
        >
          {connecting ? "Connecting…" : "Connect"}
        </button>
        {error ? (
          <p role="alert" style={errStyle}>
            {error}
          </p>
        ) : null}
      </div>

      {/* Footer: Back + Skip-for-now (the step is skippable — never a go-live blocker). */}
      <div style={{ ...footerRow, justifyContent: canGoBack ? "space-between" : "flex-end" }}>
        {canGoBack ? (
          <button type="button" onClick={onBack} disabled={connecting} style={navBtnGhost}>
            ← Back
          </button>
        ) : null}
        <button type="button" onClick={onContinue} disabled={connecting} style={skipBtn}>
          Skip for now →
        </button>
      </div>
    </div>
  );
}

// ─── styles (BUYER tokens) ───────────────────────────────────────────────────

const iconWrap: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 62,
  height: 62,
  borderRadius: 18,
  background: BUYER.accentSoft,
  color: BUYER.accent,
  marginBottom: 18,
  fontSize: 27,
  fontWeight: 700,
};
const hHeading: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 21,
  fontWeight: 650,
  letterSpacing: "-0.018em",
};
const hSub: React.CSSProperties = {
  margin: "0 auto 20px",
  maxWidth: 420,
  fontSize: 15,
  color: BUYER.ink2,
  lineHeight: 1.5,
};
const instructionsCard: React.CSSProperties = {
  padding: "16px 18px",
  borderRadius: 16,
  background: BUYER.paper2,
  border: `1px solid ${BUYER.line}`,
  marginBottom: 20,
  maxWidth: 460,
  marginLeft: "auto",
  marginRight: "auto",
};
const instructionsList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 13.5,
  color: BUYER.ink2,
  lineHeight: 1.6,
};
const mono: React.CSSProperties = {
  fontFamily: BUYER.fontMono,
  fontSize: 13,
  color: BUYER.ink,
  background: BUYER.card,
  padding: "1px 5px",
  borderRadius: 5,
};
const urlPlate: React.CSSProperties = {
  marginTop: 6,
  padding: "8px 10px",
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  borderRadius: 8,
  wordBreak: "break-all",
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
const errStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 13.5,
  color: "#B4302A",
  fontWeight: 550,
};
const footerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 26,
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
const skipBtn: React.CSSProperties = {
  ...navBtnGhost,
  color: BUYER.ink3,
  fontWeight: 600,
};
