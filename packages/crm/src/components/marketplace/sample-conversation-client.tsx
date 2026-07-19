"use client";

// "See it work" — the live sample conversation on the listing detail. Reveals
// the agent's handled conversation turn-by-turn on mount (and on Replay),
// mirroring the Claude Design output's openAgent()/replaySample() interval.
// Small self-contained island so the rest of the listing stays server-rendered.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { MarketplaceIcon } from "./marketplace-icons";
import { TypingDots } from "./marketplace-styles";
import { MKT, type StorefrontAgent } from "./marketplace-data";

export function SampleConversationClient({ agent }: { agent: StorefrontAgent }): ReactElement {
  const total = agent.sample.length;
  const [reveal, setReveal] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setReveal(0);
    timer.current = setInterval(() => {
      setReveal((r) => {
        if (r >= total) {
          if (timer.current) clearInterval(timer.current);
          return r;
        }
        return r + 1;
      });
    }, 750);
  }, [total]);

  useEffect(() => {
    start();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [start]);

  const shown = agent.sample.slice(0, reveal);
  const typing = reveal < total;

  return (
    <section style={{ padding: "30px 0", borderBottom: "1px solid rgba(34,29,23,0.10)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={sectionH2}>See it work</h2>
        <button
          type="button"
          className="sf-link"
          onClick={start}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            border: "1px solid rgba(34,29,23,0.14)",
            background: "#fff",
            color: MKT.ink,
            fontFamily: "inherit",
            fontSize: 13.5,
            fontWeight: 600,
            padding: "7px 13px",
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          <MarketplaceIcon name="play" size={13} filled />
          Replay
        </button>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 14.5, color: "rgba(34,29,23,0.55)" }}>
        A real <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic" }}>{agent.sampleChannel}</span> the agent
        handled — watch it before you hire.
      </p>
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(34,29,23,0.10)",
          borderRadius: 20,
          boxShadow: "0 1px 2px rgba(34,29,23,0.04),0 16px 36px rgba(34,29,23,0.07)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid rgba(34,29,23,0.08)", background: "rgba(34,29,23,0.015)" }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(31, 43, 36,0.11)", color: MKT.green, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <MarketplaceIcon name={agent.channelIcon} size={16} />
          </span>
          <span style={{ fontWeight: 650, fontSize: 14 }}>{agent.sampleTitle}</span>
          <span style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: MKT.green }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: MKT.green, animation: "sfPulse 1.6s infinite" }} />
            Sample
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, minHeight: 240 }}>
          {shown.map((m, i) => {
            const agentTurn = m.role === "agent";
            return (
              <div key={i} className="sf-rise" style={{ display: "flex", justifyContent: agentTurn ? "flex-start" : "flex-end" }}>
                <div
                  style={{
                    maxWidth: "78%",
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    padding: "11px 15px",
                    ...(agentTurn
                      ? { background: MKT.green, color: "#fff", borderRadius: "16px 16px 16px 5px" }
                      : { background: "rgba(34,29,23,0.05)", color: MKT.ink, borderRadius: "16px 16px 5px 16px" }),
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          {typing ? (
            <div style={{ alignSelf: "flex-start", background: "rgba(31, 43, 36,0.10)", padding: "12px 16px", borderRadius: "15px 15px 15px 4px" }}>
              <TypingDots />
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 20px", borderTop: "1px solid rgba(34,29,23,0.08)", fontSize: 13, color: "rgba(34,29,23,0.6)" }}>
          <span style={{ color: MKT.green, display: "flex" }}>
            <MarketplaceIcon name="checkCircle" size={16} />
          </span>
          <span>{agent.outcome}</span>
        </div>
      </div>
    </section>
  );
}

const sectionH2 = {
  margin: 0,
  fontSize: 21,
  fontWeight: 700,
  letterSpacing: "-0.015em",
  whiteSpace: "nowrap",
} as const;
