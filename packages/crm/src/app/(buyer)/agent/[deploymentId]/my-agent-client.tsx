"use client";

// Marketplace buyer surface — the "My Agent" home (client island).
//
// Ported STRUCTURE from the Claude Design export's "MY AGENT HOME" section, re-
// skinned to the real brand (teal #1F2B24, cream paper, DM Mono for the numbers
// the design sets in mono — NOT the export's violet). It renders the serializable
// MyAgentHomeView the server assembled:
//
//   • agent header — icon + name + a Live / Setting-up status chip + the number
//     (mono) + channel chips,
//   • this-week stats — big mono KPI cards,
//   • recent activity — a merged calls/bookings feed with outcome badges,
//   • upcoming booking cards (when present),
//   • Configure cards — deep-link back into a wizard step (/agent/[id]/setup?step=…),
//   • Billing — plan + price + "Manage billing" (opens the buyer billing portal).
//
// The page resolves everything server-side; this island only renders + opens the
// billing portal via the buyer action. Mobile-first (single column, clamp sizing).

import { useState, useTransition } from "react";

import { BUYER } from "@/components/buyer/theme";
import { openBuyerBillingPortalAction } from "@/app/(buyer)/agent/actions";
import type {
  MyAgentHomeView,
  HomeActivityBadgeTone,
  HomeActivityItem,
} from "@/lib/marketplace/buyer/agent-home";

export function MyAgentClient({
  deploymentId,
  home,
}: {
  deploymentId: string;
  home: MyAgentHomeView;
}) {
  return (
    <div style={page}>
      <AgentHeader home={home} />

      <SectionLabel>This week</SectionLabel>
      <div style={statsGrid}>
        {home.weekStats.map((kpi) => (
          <div key={kpi.label} style={statCard}>
            <div style={statValue}>{kpi.value}</div>
            <div style={statLabel}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <SectionLabel>Recent activity</SectionLabel>
      {home.activity.length > 0 ? (
        <div style={feedCard}>
          {home.activity.map((a, i) => (
            <ActivityRow key={a.id} item={a} last={i === home.activity.length - 1} />
          ))}
        </div>
      ) : (
        <div style={emptyCard}>
          No activity yet. Once your agent answers a call or books a job, it shows up here.
        </div>
      )}

      {home.bookings.length > 0 ? (
        <div style={bookingsGrid}>
          {home.bookings.map((b) => (
            <div key={b.id} style={bookingCard}>
              <div style={bookingTag}>📅 Booked</div>
              <div style={bookingService}>{b.service}</div>
              <div style={bookingCustomer}>{b.customer}</div>
              <div style={bookingWhenRow}>
                <span style={{ fontSize: 13, color: BUYER.ink2 }}>{b.when}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <SectionLabel>Configure</SectionLabel>
      <div style={configGrid}>
        {home.configure.map((c) => (
          <a key={c.kind} href={c.href} style={configCard}>
            <div style={configTopRow}>
              <div style={configIcon}>{CONFIG_ICON[c.kind] ?? "⚙"}</div>
              <span style={{ color: BUYER.ink3, fontSize: 18 }}>›</span>
            </div>
            <div style={configTitle}>{c.title}</div>
            <div style={configSub}>{c.sub}</div>
          </a>
        ))}
      </div>

      <SectionLabel>Billing</SectionLabel>
      <BillingPanel deploymentId={deploymentId} billing={home.billing} />
    </div>
  );
}

// ─── agent header ────────────────────────────────────────────────────────────

function AgentHeader({ home }: { home: MyAgentHomeView }) {
  const live = home.status === "live";
  const chip =
    home.status === "live"
      ? { label: "Live", tone: BUYER.positive, soft: BUYER.posSoft }
      : home.status === "paused"
        ? { label: "Paused", tone: BUYER.amber, soft: BUYER.amberSoft }
        : { label: "Setting up", tone: BUYER.info, soft: BUYER.infoSoft };
  return (
    <div style={headerRow}>
      <div style={agentAvatar}>{home.businessName.charAt(0).toUpperCase() || "A"}</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <h1 style={agentName}>{home.name}</h1>
          <span style={{ ...statusChip, background: chip.soft, color: chip.tone }}>
            <span style={{ ...statusDot, background: chip.tone }} />
            {chip.label}
          </span>
        </div>
        {home.phoneNumber ? (
          <div style={agentNumber}>{prettyPhone(home.phoneNumber)}</div>
        ) : !live ? (
          <div style={{ fontSize: 13.5, color: BUYER.ink3, marginBottom: 10 }}>
            Finish setup to give your agent a number.
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {home.channels.map((ch) => (
            <span key={ch} style={channelChip}>
              {ch}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── activity row ────────────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<HomeActivityItem["icon"], string> = {
  phone: "☎",
  calendar: "📅",
  chat: "💬",
};

function badgeStyle(tone: HomeActivityBadgeTone): React.CSSProperties {
  const map: Record<HomeActivityBadgeTone, { bg: string; fg: string }> = {
    pos: { bg: BUYER.posSoft, fg: BUYER.positive },
    info: { bg: BUYER.infoSoft, fg: BUYER.info },
    amber: { bg: BUYER.amberSoft, fg: BUYER.amber },
    neutral: { bg: BUYER.paper2, fg: BUYER.ink2 },
  };
  const c = map[tone];
  return {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
    background: c.bg,
    color: c.fg,
  };
}

function ActivityRow({ item, last }: { item: HomeActivityItem; last: boolean }) {
  return (
    <div style={{ ...activityRow, borderBottom: last ? "none" : `1px solid ${BUYER.line}` }}>
      <div style={activityIcon}>{ACTIVITY_ICON[item.icon]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={activityTitle}>{item.title}</div>
        <div style={activitySub}>
          {item.detail} · {item.time}
        </div>
      </div>
      <span style={badgeStyle(item.badgeTone)}>{item.badgeLabel}</span>
    </div>
  );
}

// ─── billing panel ───────────────────────────────────────────────────────────

function BillingPanel({
  deploymentId,
  billing,
}: {
  deploymentId: string;
  billing: MyAgentHomeView["billing"];
}) {
  const [opening, startOpening] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function manage() {
    setError(null);
    startOpening(async () => {
      const r = await openBuyerBillingPortalAction(deploymentId);
      if (r.ok) {
        window.location.href = r.url;
        return;
      }
      setError(
        r.reason === "no_billing"
          ? "There’s nothing to manage on the free plan."
          : "Couldn’t open billing right now — please try again.",
      );
    });
  }

  return (
    <div style={billingCard}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 15.5, fontWeight: 650, marginBottom: 4 }}>{billing.plan}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span style={{ fontFamily: BUYER.fontMono, fontSize: 24, fontWeight: 600 }}>
            {billing.price}
          </span>
        </div>
        {error ? (
          <p role="alert" style={{ margin: "8px 0 0", fontSize: 12.5, color: "#B4302A", fontWeight: 550 }}>
            {error}
          </p>
        ) : null}
      </div>
      {billing.canManage ? (
        <button type="button" onClick={manage} disabled={opening} style={manageBtn}>
          {opening ? "Opening…" : "Manage billing"}
        </button>
      ) : (
        <span style={{ fontSize: 13, color: BUYER.ink3 }}>Free forever</span>
      )}
    </div>
  );
}

// ─── small bits ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={sectionLabel}>{children}</div>;
}

const CONFIG_ICON: Record<string, string> = {
  business_info: "🏢",
  brand_info: "🎨",
  phone: "☎",
  connect_tool: "📅",
};

/** "+16025550148" → "(602) 555-0148"; non-NANP returned as-is. */
function prettyPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// ─── styles (BUYER tokens; teal + cream, never violet) ───────────────────────

const page: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "clamp(20px,4vw,32px) 20px 48px",
};
const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 18,
  marginBottom: 28,
  flexWrap: "wrap",
};
const agentAvatar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 60,
  height: 60,
  borderRadius: 18,
  background: BUYER.accentSoft,
  color: BUYER.accent,
  flexShrink: 0,
  fontSize: 26,
  fontWeight: 700,
};
const agentName: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(22px,5vw,27px)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
};
const statusChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 11px",
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 600,
};
const statusDot: React.CSSProperties = { width: 7, height: 7, borderRadius: 999 };
const agentNumber: React.CSSProperties = {
  fontFamily: BUYER.fontMono,
  fontSize: 17,
  fontWeight: 500,
  letterSpacing: "-0.01em",
  marginBottom: 10,
};
const channelChip: React.CSSProperties = {
  padding: "4px 11px",
  borderRadius: 999,
  background: BUYER.paper2,
  border: `1px solid ${BUYER.line}`,
  fontSize: 12.5,
  fontWeight: 550,
  color: BUYER.ink2,
};
const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: BUYER.ink3,
  fontWeight: 600,
  marginBottom: 12,
  marginTop: 4,
};
const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: 30,
};
const statCard: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  boxShadow: BUYER.shadowSoft,
};
const statValue: React.CSSProperties = {
  fontFamily: BUYER.fontMono,
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  lineHeight: 1,
};
const statLabel: React.CSSProperties = { fontSize: 13, color: BUYER.ink2, marginTop: 8 };
const feedCard: React.CSSProperties = {
  borderRadius: 18,
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  boxShadow: BUYER.shadowSoft,
  overflow: "hidden",
  marginBottom: 30,
};
const emptyCard: React.CSSProperties = {
  borderRadius: 18,
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  boxShadow: BUYER.shadowSoft,
  padding: "20px 18px",
  fontSize: 14,
  color: BUYER.ink2,
  lineHeight: 1.5,
  marginBottom: 30,
};
const activityRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 13,
  padding: "14px 16px",
};
const activityIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 38,
  height: 38,
  borderRadius: 11,
  background: BUYER.paper2,
  color: BUYER.ink2,
  flexShrink: 0,
  fontSize: 17,
};
const activityTitle: React.CSSProperties = {
  fontSize: 14.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const activitySub: React.CSSProperties = {
  fontSize: 12.5,
  color: BUYER.ink3,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const bookingsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginBottom: 30,
};
const bookingCard: React.CSSProperties = {
  padding: "16px 18px",
  borderRadius: 18,
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  boxShadow: BUYER.shadowSoft,
};
const bookingTag: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
  color: BUYER.accent,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};
const bookingService: React.CSSProperties = { fontSize: 15.5, fontWeight: 650, marginBottom: 3 };
const bookingCustomer: React.CSSProperties = { fontSize: 13, color: BUYER.ink2, marginBottom: 12 };
const bookingWhenRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingTop: 12,
  borderTop: `1px solid ${BUYER.line}`,
};
const configGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 30,
};
const configCard: React.CSSProperties = {
  display: "block",
  textAlign: "left",
  padding: 18,
  borderRadius: 18,
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  boxShadow: BUYER.shadowSoft,
  textDecoration: "none",
  color: BUYER.ink,
};
const configTopRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 14,
};
const configIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 38,
  height: 38,
  borderRadius: 11,
  background: BUYER.accentSoft,
  color: BUYER.accent,
  fontSize: 18,
};
const configTitle: React.CSSProperties = { fontSize: 15, fontWeight: 650, marginBottom: 2 };
const configSub: React.CSSProperties = { fontSize: 12.5, color: BUYER.ink2 };
const billingCard: React.CSSProperties = {
  padding: 20,
  borderRadius: 18,
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  boxShadow: BUYER.shadowSoft,
  display: "flex",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap",
};
const manageBtn: React.CSSProperties = {
  height: 44,
  padding: "0 18px",
  borderRadius: 12,
  border: `1px solid ${BUYER.lineStrong}`,
  background: BUYER.card,
  color: BUYER.ink,
  fontFamily: BUYER.fontSans,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
