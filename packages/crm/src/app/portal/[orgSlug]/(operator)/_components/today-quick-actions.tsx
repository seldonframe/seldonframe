"use client";

// today-quick-actions.tsx — DS-styled Today screen.
//
// All data wiring + server actions PRESERVED:
//  - createOperatorContactAction (Add Contact sheet)
//  - requestReviewAction (Request Review sheet)
//  - /book/${orgSlug}/default (New Booking link)
//  - pipelineRollup (Pipeline card → stage breakdown sheet)
//  - Missed calls stub (0 / "None today")
//  - Scan card → disabled "Soon" tile
//
// Only the presentation layer changes to use SeldonFrame Mobile DS components.

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  UserPlus,
  CalendarPlus,
  Star,
  ScanLine,
  MessageSquare,
  PhoneMissed,
  CalendarCheck,
  ChevronRight,
  X,
} from "lucide-react";
import {
  KpiCard,
  QuickAction,
  SectionHeader,
  ListRow,
  Card,
  Avatar,
  Badge,
  DSSheet,
  DSInput,
  Button,
  Skeleton,
} from "@/components/operator-portal/ds";
import {
  createOperatorContactAction,
  requestReviewAction,
} from "@/lib/operator-portal/today-actions";
import type { PipelineRollup } from "@/lib/operator-portal/today";
import { contactDisplayName } from "@/lib/operator-portal/mobile-format";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecentContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

type TodayBooking = {
  id: string;
  title: string;
  startsAt: Date;
  fullName: string | null;
};

// ─── Add Contact Sheet ────────────────────────────────────────────────────────

function AddContactSheet({
  open,
  onClose,
  orgSlug,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true; message: string } | { ok: false; error: string } | null
  >(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("lead");

  const reset = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setStatus("lead");
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await createOperatorContactAction({
        orgSlug,
        firstName,
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        status,
      });
      if (res.ok) {
        setResult({ ok: true, message: "Contact added!" });
        setTimeout(() => { handleClose(); }, 1200);
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  };

  return (
    <DSSheet open={open} onClose={handleClose} title="Add contact">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <DSInput
          label="First name"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Jane"
          autoFocus
        />
        <DSInput
          label="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Doe"
        />
        <DSInput
          label="Phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 000 1234"
        />
        <DSInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
        />

        {/* Status select — uses same field styling as DS Input */}
        <div>
          <span
            style={{
              display: "block",
              marginBottom: 7,
              fontSize: "var(--type-label)",
              fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
              color: "var(--text-secondary)",
            }}
          >
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              width: "100%",
              height: "var(--control-h)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-field)",
              padding: "0 14px",
              fontSize: "var(--type-body)",
              color: "var(--text-primary)",
              backgroundColor: "var(--surface-card)",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          >
            <option value="lead">Lead</option>
            <option value="active">Active</option>
            <option value="prospect">Prospect</option>
            <option value="customer">Customer</option>
          </select>
        </div>

        {result && (
          <div
            style={{
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              fontSize: "var(--type-label)",
              backgroundColor: result.ok ? "var(--positive-soft)" : "var(--negative-soft)",
              color: result.ok ? "var(--positive)" : "var(--negative)",
              border: `1px solid ${result.ok ? "var(--positive)" : "var(--negative)"}`,
              opacity: 0.8,
            }}
          >
            {result.ok ? result.message : result.error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={isPending}
          disabled={!firstName.trim()}
        >
          Add contact
        </Button>
      </form>
    </DSSheet>
  );
}

// ─── Request Review Sheet ─────────────────────────────────────────────────────

function RequestReviewSheet({
  open,
  onClose,
  orgSlug,
  defaultReviewLink,
  recentContacts,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  defaultReviewLink: string;
  recentContacts: RecentContact[];
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; emailSent: boolean; smsSent: boolean }
    | { ok: false; error: string }
    | null
  >(null);
  const [contactId, setContactId] = useState<string>("");
  const [reviewLink, setReviewLink] = useState(defaultReviewLink);
  const [contactSearch, setContactSearch] = useState("");

  const handleClose = () => {
    setResult(null);
    setContactId("");
    setContactSearch("");
    setReviewLink(defaultReviewLink);
    onClose();
  };

  const filteredContacts = contactSearch.trim()
    ? recentContacts.filter((c) => {
        const q = contactSearch.toLowerCase();
        const name = `${c.firstName} ${c.lastName ?? ""}`.toLowerCase();
        const em = (c.email ?? "").toLowerCase();
        return name.includes(q) || em.includes(q);
      })
    : recentContacts.slice(0, 10);

  const selected = recentContacts.find((c) => c.id === contactId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !reviewLink.trim()) return;
    setResult(null);
    startTransition(async () => {
      const res = await requestReviewAction({
        orgSlug,
        contactId: selected.id,
        toEmail: selected.email ?? "",
        toPhone: selected.phone ?? "",
        contactName: `${selected.firstName}${selected.lastName ? " " + selected.lastName : ""}`,
        reviewLink: reviewLink.trim(),
      });
      if (res.ok) {
        setResult({ ok: true, emailSent: res.emailSent, smsSent: res.smsSent });
        setTimeout(() => handleClose(), 2000);
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  };

  return (
    <DSSheet open={open} onClose={handleClose} title="Request review">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Contact picker */}
        <div>
          <span
            style={{
              display: "block",
              marginBottom: 7,
              fontSize: "var(--type-label)",
              fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
              color: "var(--text-secondary)",
            }}
          >
            Contact <span style={{ color: "var(--negative)" }}>*</span>
          </span>
          {selected ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: "var(--control-h)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--accent)",
                padding: "0 14px",
                backgroundColor: "var(--accent-soft)",
                boxShadow: "var(--focus-ring)",
              }}
            >
              <span style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
                {selected.firstName} {selected.lastName ?? ""}
              </span>
              <button
                type="button"
                onClick={() => { setContactId(""); setContactSearch(""); }}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <DSInput
                placeholder="Search by name or email..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
              />
              {filteredContacts.length > 0 && (
                <div
                  style={{
                    marginTop: 4,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-hairline)",
                    backgroundColor: "var(--surface-card)",
                    overflow: "hidden",
                    maxHeight: 220,
                    overflowY: "auto",
                    boxShadow: "var(--shadow-popover)",
                  }}
                >
                  {filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setContactId(c.id); setContactSearch(""); }}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        textAlign: "left",
                        border: "none",
                        borderBottom: "1px solid var(--border-hairline)",
                        backgroundColor: "transparent",
                        cursor: "pointer",
                        fontSize: "var(--type-label)",
                        color: "var(--text-primary)",
                        minHeight: "var(--tap-min)",
                        fontFamily: "inherit",
                      }}
                    >
                      <span style={{ fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"] }}>
                        {c.firstName} {c.lastName ?? ""}
                      </span>
                      {c.email && (
                        <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: "var(--type-caption)" }}>
                          {c.email}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {filteredContacts.length === 0 && contactSearch.trim() && (
                <p style={{ fontSize: "var(--type-caption)", color: "var(--text-muted)", marginTop: 6 }}>
                  No contacts found.
                </p>
              )}
            </>
          )}
        </div>

        <DSInput
          label="Review link"
          required
          type="url"
          value={reviewLink}
          onChange={(e) => setReviewLink(e.target.value)}
          placeholder="https://g.page/r/your-listing"
          hint="Google, Yelp, or any review platform URL"
        />

        {result && (
          <div
            style={{
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              fontSize: "var(--type-label)",
              backgroundColor: result.ok ? "var(--positive-soft)" : "var(--negative-soft)",
              color: result.ok ? "var(--positive)" : "var(--negative)",
              border: `1px solid ${result.ok ? "var(--positive)" : "var(--negative)"}`,
              opacity: 0.8,
            }}
          >
            {result.ok
              ? `Sent${result.emailSent ? " via email" : ""}${result.smsSent ? " + SMS" : ""}!`
              : result.error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={isPending}
          disabled={!selected || !reviewLink.trim()}
        >
          Send review request
        </Button>
      </form>
    </DSSheet>
  );
}

// ─── Pipeline Sheet ───────────────────────────────────────────────────────────

function PipelineSheet({
  open,
  onClose,
  rollup,
}: {
  open: boolean;
  onClose: () => void;
  rollup: PipelineRollup;
}) {
  const fmt = (n: number) =>
    "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <DSSheet open={open} onClose={onClose} title="Pipeline breakdown">
      {rollup.byStage.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--type-label)", paddingBottom: 24 }}>
          No open deals in the pipeline yet.
        </p>
      ) : (
        <div style={{ paddingBottom: 24 }}>
          {rollup.byStage.map((stage) => (
            <div
              key={stage.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid var(--border-hairline)",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "var(--type-subhead)",
                    fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  {stage.name}
                </p>
                <p style={{ fontSize: "var(--type-caption)", color: "var(--text-muted)", margin: 0, marginTop: 2 }}>
                  {stage.count} deal{stage.count !== 1 ? "s" : ""}
                </p>
              </div>
              <p
                style={{
                  fontSize: "var(--type-heading)",
                  fontWeight: "var(--weight-bold)" as React.CSSProperties["fontWeight"],
                  color: "var(--accent)",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  margin: 0,
                }}
              >
                {fmt(stage.totalValue)}
              </p>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 16,
            }}
          >
            <p
              style={{
                fontSize: "var(--type-subhead)",
                fontWeight: "var(--weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Total
            </p>
            <p
              style={{
                fontSize: "var(--type-title)",
                fontWeight: "var(--weight-heavy)" as React.CSSProperties["fontWeight"],
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                margin: 0,
              }}
            >
              {fmt(rollup.totalOpenValue)}
            </p>
          </div>
        </div>
      )}
    </DSSheet>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function TodayQuickActions({
  orgSlug,
  accentColor: _accentColor,  // kept in props for compat but accent comes from CSS var
  rollup,
  defaultReviewLink,
  recentContacts,
  newLeads,
  unreadTexts,
  todaysApptsCount,
  todaysBookings,
}: {
  orgSlug: string;
  accentColor: string;
  rollup: PipelineRollup;
  defaultReviewLink: string;
  recentContacts: RecentContact[];
  newLeads: number;
  unreadTexts: number;
  todaysApptsCount: number;
  todaysBookings: TodayBooking[];
}) {
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);

  const formattedPipeline =
    rollup.totalOpenValue === 0
      ? null
      : "$" + rollup.totalOpenValue.toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });

  const totalDeals = rollup.byStage.reduce((s, x) => s + x.count, 0);

  return (
    <>
      {/* ── KPI Glance Row ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <KpiCard
          Icon={UserPlus}
          label="New leads"
          value={newLeads}
          tone="accent"
          note={newLeads > 0 ? "Tap Leads to work" : "All clear"}
        />
        <KpiCard
          Icon={CalendarCheck}
          label="Today's appts"
          value={todaysApptsCount}
          tone="neutral"
          note={todaysApptsCount > 0 ? `${todaysApptsCount} scheduled` : "Nothing booked"}
        />
        <KpiCard
          Icon={MessageSquare}
          label="Unread"
          value={unreadTexts}
          tone={unreadTexts > 0 ? "caution" : "neutral"}
          note={unreadTexts > 0 ? "Needs a reply" : "All read"}
        />
        {/* Missed calls — stub (OCR/calling deferred) */}
        <KpiCard
          Icon={PhoneMissed}
          label="Missed calls"
          value={0}
          tone="positive"
          note="None today"
        />
      </div>

      {/* ── Pipeline Card ───────────────────────────────────────────── */}
      <Card pressable onClick={() => setPipelineOpen(true)} padding={16}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-eyebrow">Open pipeline</div>
            {formattedPipeline ? (
              <div
                style={{
                  fontSize: 30,
                  fontWeight: "var(--weight-heavy)" as React.CSSProperties["fontWeight"],
                  letterSpacing: "var(--track-display)",
                  color: "var(--text-primary)",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--font-mono)",
                  marginTop: 6,
                  lineHeight: 1.1,
                }}
              >
                {formattedPipeline}
              </div>
            ) : (
              <div style={{ fontSize: "var(--type-subhead)", color: "var(--text-muted)", marginTop: 6 }}>
                No open deals — add your first deal from the Leads tab
              </div>
            )}
            {totalDeals > 0 && (
              <div style={{ fontSize: "var(--type-caption)", color: "var(--text-muted)", marginTop: 4 }}>
                {totalDeals} deal{totalDeals !== 1 ? "s" : ""} across {rollup.byStage.length} stage{rollup.byStage.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              fontSize: "var(--type-caption)",
              fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
              color: "var(--accent)",
              flexShrink: 0,
              paddingTop: 2,
            }}
          >
            By stage <ChevronRight size={15} />
          </span>
        </div>

        {/* Stage progress bar */}
        {rollup.byStage.length > 0 && (
          <>
            <div
              style={{
                display: "flex",
                gap: 3,
                marginTop: 16,
                height: 6,
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              {rollup.byStage.map((s) => (
                <span
                  key={s.name}
                  style={{
                    flex: s.totalValue || 1,
                    background: "var(--accent)",
                    opacity: 0.3 + (0.7 * (rollup.byStage.indexOf(s) + 1)) / rollup.byStage.length,
                    borderRadius: 999,
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              {rollup.byStage.map((s) => (
                <span
                  key={s.name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: "var(--type-caption)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: "var(--accent)",
                    }}
                  />
                  {s.name}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ── Quick Actions Row ────────────────────────────────────────── */}
      <div>
        <div className="t-eyebrow" style={{ marginBottom: 10, padding: "0 2px" }}>
          Quick actions
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <QuickAction
            Icon={UserPlus}
            label="Add contact"
            onClick={() => setAddContactOpen(true)}
          />
          {/* New Booking → external link, no sheet needed */}
          <QuickActionLink
            Icon={CalendarPlus}
            label="New booking"
            href={`/book/${orgSlug}/default`}
          />
          <QuickAction
            Icon={Star}
            label="Request review"
            onClick={() => setReviewOpen(true)}
          />
          {/* Scan card — OCR deferred, disabled stub */}
          <QuickAction
            Icon={ScanLine}
            label="Scan card"
            disabled
          />
        </div>
      </div>

      {/* ── Up Next ─────────────────────────────────────────────────── */}
      {todaysBookings.length > 0 ? (
        <div>
          <SectionHeader title="Up next" style={{ marginBottom: 8 }} />
          <Card padding={6}>
            {todaysBookings.map((b, i) => {
              const time = new Date(b.startsAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              const name = contactDisplayName({
                firstName: b.fullName,
                lastName: null,
              });
              return (
                <div key={b.id}>
                  <ListRow
                    leading={<Avatar name={name} size={36} />}
                    title={b.title}
                    subtitle={name}
                    meta={time}
                    trailing={<Badge tone="neutral" dot>Confirmed</Badge>}
                    chevron
                  />
                  {i < todaysBookings.length - 1 && (
                    <div
                      style={{
                        height: 1,
                        background: "var(--border-hairline)",
                        margin: "0 12px",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      ) : (
        <Card padding={16}>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>Up next</div>
          <p style={{ fontSize: "var(--type-label)", color: "var(--text-muted)", margin: 0 }}>
            Nothing on the schedule yet today.
          </p>
        </Card>
      )}

      {/* ── Sheets ──────────────────────────────────────────────────── */}
      <AddContactSheet
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        orgSlug={orgSlug}
      />
      <RequestReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        orgSlug={orgSlug}
        defaultReviewLink={defaultReviewLink}
        recentContacts={recentContacts}
      />
      <PipelineSheet
        open={pipelineOpen}
        onClose={() => setPipelineOpen(false)}
        rollup={rollup}
      />
    </>
  );
}

// ─── QuickActionLink — DS-styled link tile (wraps Next Link) ─────────────────

function QuickActionLink({
  Icon,
  label,
  href,
}: {
  Icon: React.ComponentType<{ size?: number }>;
  label: string;
  href: string;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Link
      href={href}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        padding: "12px 6px",
        background: "var(--surface-card)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-xs)",
        cursor: "pointer",
        transform: pressed ? "scale(var(--press-scale))" : "scale(1)",
        transition: "transform var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent",
        minHeight: "var(--tap-min)",
        textDecoration: "none",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "38px",
          height: "38px",
          borderRadius: "var(--radius-sm)",
          background: "var(--accent-soft)",
          color: "var(--accent)",
        }}
      >
        <Icon size={19} />
      </span>
      <span
        style={{
          fontSize: "var(--type-caption)",
          fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
          color: "var(--text-secondary)",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </Link>
  );
}
