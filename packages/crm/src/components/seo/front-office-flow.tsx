// The point-making diagram for comparison/alternative pages: "gluing tools
// together" (disconnected, muted) vs "one connected flow" (green-accented,
// chained). Pure divs/flex — no JS, no images — matching the templates' inline
// -style MKT system. Sells the CONCEPT only; per-competitor feature claims
// stay in the comparison table (never-lies).

import type { CSSProperties, ReactElement } from "react";
import { MKT } from "@/components/marketplace/marketplace-data";

const OLD_WAY_BOXES = ["Website", "Booking app", "CRM", "Phone/voicemail", "Forms"];

const NEW_WAY_STEPS = [
  { icon: "📞", label: "Customer calls or texts" },
  { icon: "🤖", label: "AI answers in seconds, 24/7" },
  { icon: "✅", label: "Lead gets qualified" },
  { icon: "📅", label: "Job booked on your calendar" },
  { icon: "📇", label: "Everything saved in your CRM" },
];

export function FrontOfficeFlow({
  competitorName,
  competitorCategory,
}: {
  competitorName?: string;
  competitorCategory?: string;
}): ReactElement {
  const oldWaySubtitle = competitorCategory
    ? `a ${competitorCategory} covers one or two of these boxes`
    : undefined;
  const ariaLabel = competitorName
    ? `Diagram: the old way glues together separate tools like ${OLD_WAY_BOXES.join(
        ", ",
      )}, and leads fall through the gaps between them (${competitorName} typically covers one or two). The SeldonFrame way connects the whole flow: ${NEW_WAY_STEPS.map(
        (s) => s.label,
      ).join(" leads to ")}.`
    : `Diagram: the old way glues together separate tools like ${OLD_WAY_BOXES.join(
        ", ",
      )}, and leads fall through the gaps between them. The SeldonFrame way connects the whole flow: ${NEW_WAY_STEPS.map(
        (s) => s.label,
      ).join(" leads to ")}.`;

  return (
    <div className="sf-flow" role="img" aria-label={ariaLabel}>
      <FrontOfficeFlowStyles />
      <div className="sf-flow-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
        {/* ── OLD WAY (muted, disconnected, slightly askew) ── */}
        <div
          style={{
            border: `1px dashed rgba(34,29,23,0.22)`,
            borderRadius: 16,
            padding: "20px 20px 18px",
            background: "rgba(34,29,23,0.035)",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: "rgba(34,29,23,0.6)" }}>
            The old way: gluing tools together
          </h3>
          {oldWaySubtitle && (
            <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: "rgba(34,29,23,0.45)" }}>{oldWaySubtitle}</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            {OLD_WAY_BOXES.map((box, i) => (
              <span
                key={box}
                style={{
                  ...OLD_BOX_BASE,
                  transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (2 + (i % 3))}deg)`,
                }}
              >
                {box}
              </span>
            ))}
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 12.5, fontWeight: 700, color: "#C0392B" }}>✗ leads fall through the gaps</p>
        </div>

        {/* ── NEW WAY (connected, green-accented chain) ── */}
        <div
          style={{
            border: `1.5px solid rgba(0,137,123,0.35)`,
            borderRadius: 16,
            padding: "20px 20px 18px",
            background: MKT.green10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: MKT.green }}>The SeldonFrame way: one connected flow</h3>
          <div className="sf-flow-chain" style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 16 }}>
            {NEW_WAY_STEPS.map((step, i) => (
              <div key={step.label} className="sf-flow-step-wrap">
                <div className="sf-flow-step" style={NEW_STEP_BOX}>
                  <span aria-hidden="true" style={{ fontSize: 16 }}>
                    {step.icon}
                  </span>
                  <span>{step.label}</span>
                </div>
                {i < NEW_WAY_STEPS.length - 1 && (
                  <div className="sf-flow-arrow" aria-hidden="true">
                    <span className="sf-flow-arrow-down">↓</span>
                    <span className="sf-flow-arrow-right">→</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const OLD_BOX_BASE: CSSProperties = {
  display: "inline-block",
  border: `1px solid rgba(34,29,23,0.18)`,
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 700,
  color: "rgba(34,29,23,0.55)",
  background: "rgba(255,255,255,0.6)",
};

const NEW_STEP_BOX: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: `1px solid rgba(0,137,123,0.3)`,
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13.5,
  fontWeight: 700,
  color: "rgba(34,29,23,0.85)",
  background: "rgba(255,255,255,0.7)",
};

/** Scoped responsive tweaks: vertical stacked chain (with ↓) on mobile,
 *  horizontal chain (with →) on desktop — inline styles can't express media
 *  queries, matching the other templates' convention. */
function FrontOfficeFlowStyles(): ReactElement {
  return (
    <style>{`
      .sf-flow .sf-flow-arrow { text-align: center; font-size: 15px; font-weight: 800; color: ${MKT.green}; padding: 2px 0; }
      .sf-flow .sf-flow-arrow-right { display: none; }
      .sf-flow .sf-flow-arrow-down { display: inline; }

      @media (max-width: 860px) {
        .sf-flow .sf-flow-grid { grid-template-columns: 1fr !important; }
      }

      @media (min-width: 861px) {
        .sf-flow .sf-flow-chain { flex-direction: row !important; align-items: stretch; flex-wrap: wrap; }
        .sf-flow .sf-flow-step-wrap { display: flex; align-items: center; }
        .sf-flow .sf-flow-step { height: 100%; }
        .sf-flow .sf-flow-arrow { padding: 0 6px; }
        .sf-flow .sf-flow-arrow-right { display: inline; }
        .sf-flow .sf-flow-arrow-down { display: none; }
      }
    `}</style>
  );
}
