"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  createOperatorContactAction,
  requestReviewAction,
} from "@/lib/operator-portal/today-actions";
import type { PipelineRollup } from "@/lib/operator-portal/today";

// ─── Sheet backdrop / panel ───────────────────────────────────────────────────

function Sheet({
  open,
  onClose,
  title,
  children,
  accentColor,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  accentColor: string;
}) {
  // Close on backdrop click
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            ref={backdropRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              zIndex: 50,
            }}
          />
          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              x: "-50%",
              width: "min(100vw, 640px)",
              backgroundColor: "#FFFFFF",
              borderRadius: "20px 20px 0 0",
              zIndex: 51,
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
              boxShadow: "0 -4px 32px rgba(0,0,0,0.12)",
            }}
          >
            {/* Drag handle */}
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#DDD",
                margin: "12px auto 0",
              }}
            />
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px 12px",
                borderBottom: "1px solid #F0F0EE",
              }}
            >
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: "#111",
                  letterSpacing: "-0.3px",
                }}
              >
                {title}
              </span>
              <button
                onClick={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "none",
                  backgroundColor: "#F0F0EE",
                  color: "#666",
                  fontSize: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {/* Body */}
            <div style={{ padding: "20px 20px 0" }}>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

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
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: "#555",
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: "#E53E3E", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: "1.5px solid #E0E0DE",
  padding: "0 14px",
  fontSize: 15,
  color: "#111",
  backgroundColor: "#F9F9F7",
  outline: "none",
  boxSizing: "border-box",
};

// ─── Add Contact Sheet ────────────────────────────────────────────────────────

function AddContactSheet({
  open,
  onClose,
  orgSlug,
  accentColor,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  accentColor: string;
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
        setTimeout(() => {
          handleClose();
        }, 1200);
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  };

  return (
    <Sheet open={open} onClose={handleClose} title="Add Contact" accentColor={accentColor}>
      <form onSubmit={handleSubmit}>
        <Field label="First Name" required>
          <input
            style={inputStyle}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Jane"
            required
            autoFocus
          />
        </Field>
        <Field label="Last Name">
          <input
            style={inputStyle}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
          />
        </Field>
        <Field label="Phone">
          <input
            style={inputStyle}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 000 1234"
          />
        </Field>
        <Field label="Email">
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </Field>
        <Field label="Status">
          <select
            style={{ ...inputStyle, appearance: "none", paddingRight: 36 }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="lead">Lead</option>
            <option value="active">Active</option>
            <option value="prospect">Prospect</option>
            <option value="customer">Customer</option>
          </select>
        </Field>

        {result && (
          <div
            style={{
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 14,
              marginBottom: 16,
              backgroundColor: result.ok ? "#F0FFF4" : "#FFF5F5",
              color: result.ok ? "#276749" : "#C53030",
              border: `1px solid ${result.ok ? "#C6F6D5" : "#FED7D7"}`,
            }}
          >
            {result.ok ? result.message : result.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !firstName.trim()}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            border: "none",
            backgroundColor: isPending || !firstName.trim() ? "#C7B8E8" : accentColor,
            color: "#FFFFFF",
            fontSize: 16,
            fontWeight: 600,
            cursor: isPending || !firstName.trim() ? "not-allowed" : "pointer",
            marginBottom: 8,
            transition: "opacity 0.15s",
          }}
        >
          {isPending ? "Adding…" : "Add Contact"}
        </button>
      </form>
    </Sheet>
  );
}

// ─── Request Review Sheet ─────────────────────────────────────────────────────

export type RecentContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

function RequestReviewSheet({
  open,
  onClose,
  orgSlug,
  accentColor,
  defaultReviewLink,
  recentContacts,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  accentColor: string;
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
    <Sheet open={open} onClose={handleClose} title="Request Review" accentColor={accentColor}>
      <form onSubmit={handleSubmit}>
        {/* Contact picker */}
        <Field label="Select Contact" required>
          {selected ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 48,
                borderRadius: 12,
                border: `1.5px solid ${accentColor}`,
                padding: "0 14px",
                backgroundColor: "#F9F9F7",
              }}
            >
              <span style={{ fontSize: 15, color: "#111" }}>
                {selected.firstName} {selected.lastName ?? ""}
              </span>
              <button
                type="button"
                onClick={() => { setContactId(""); setContactSearch(""); }}
                style={{
                  border: "none",
                  background: "none",
                  color: "#999",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                style={inputStyle}
                placeholder="Search by name or email…"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
              />
              {filteredContacts.length > 0 && (
                <div
                  style={{
                    marginTop: 4,
                    borderRadius: 12,
                    border: "1px solid #E5E5E1",
                    backgroundColor: "#FFF",
                    overflow: "hidden",
                    maxHeight: 200,
                    overflowY: "auto",
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
                        borderBottom: "1px solid #F0F0EE",
                        backgroundColor: "transparent",
                        cursor: "pointer",
                        fontSize: 14,
                        color: "#222",
                        minHeight: 48,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>
                        {c.firstName} {c.lastName ?? ""}
                      </span>
                      {c.email && (
                        <span style={{ color: "#888", marginLeft: 8, fontSize: 12 }}>
                          {c.email}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {filteredContacts.length === 0 && contactSearch.trim() && (
                <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
                  No contacts found.
                </p>
              )}
            </>
          )}
        </Field>

        {/* Review link */}
        <Field label="Review Link" required>
          <input
            style={inputStyle}
            type="url"
            value={reviewLink}
            onChange={(e) => setReviewLink(e.target.value)}
            placeholder="https://g.page/r/your-listing"
            required
          />
          <p style={{ fontSize: 12, color: "#AAA", marginTop: 4 }}>
            Google, Yelp, or any review platform URL
          </p>
        </Field>

        {result && (
          <div
            style={{
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 14,
              marginBottom: 16,
              backgroundColor: result.ok ? "#F0FFF4" : "#FFF5F5",
              color: result.ok ? "#276749" : "#C53030",
              border: `1px solid ${result.ok ? "#C6F6D5" : "#FED7D7"}`,
            }}
          >
            {result.ok
              ? `Sent${result.emailSent ? " via email" : ""}${result.smsSent ? " + SMS" : ""}!`
              : result.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !selected || !reviewLink.trim()}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            border: "none",
            backgroundColor:
              isPending || !selected || !reviewLink.trim()
                ? "#C7B8E8"
                : accentColor,
            color: "#FFFFFF",
            fontSize: 16,
            fontWeight: 600,
            cursor:
              isPending || !selected || !reviewLink.trim()
                ? "not-allowed"
                : "pointer",
            marginBottom: 8,
            transition: "opacity 0.15s",
          }}
        >
          {isPending ? "Sending…" : "Send Review Request"}
        </button>
      </form>
    </Sheet>
  );
}

// ─── Pipeline $ Sheet ─────────────────────────────────────────────────────────

function PipelineSheet({
  open,
  onClose,
  rollup,
  accentColor,
}: {
  open: boolean;
  onClose: () => void;
  rollup: PipelineRollup;
  accentColor: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Pipeline Breakdown" accentColor={accentColor}>
      {rollup.byStage.length === 0 ? (
        <p style={{ color: "#999", fontSize: 14, paddingBottom: 24 }}>
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
                borderBottom: "1px solid #F0F0EE",
              }}
            >
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: "#111" }}>
                  {stage.name}
                </p>
                <p style={{ fontSize: 12, color: "#999" }}>
                  {stage.count} deal{stage.count !== 1 ? "s" : ""}
                </p>
              </div>
              <p
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: accentColor,
                }}
              >
                ${stage.totalValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
            <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>Total</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: accentColor }}>
              ${rollup.totalOpenValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ─── Quick Action icons (inline SVG, strokeWidth=2, 20×20) ───────────────────

const IconUserPlus = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);

const IconCalendarPlus = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <line x1="12" y1="15" x2="12" y2="19" />
    <line x1="10" y1="17" x2="14" y2="17" />
  </svg>
);

const IconStar = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// ─── Quick Action Tile ────────────────────────────────────────────────────────

function QuickActionTile({
  label,
  icon,
  onClick,
  href,
  accentColor,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  accentColor: string;
}) {
  const style: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 80,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    border: "1px solid #E5E5E1",
    cursor: "pointer",
    padding: "12px 8px",
    textDecoration: "none",
    WebkitTapHighlightColor: "transparent",
  };

  const inner = (
    <>
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: `${accentColor}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: accentColor,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#333",
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <a href={href} style={style}>
        {inner}
      </a>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{ ...style, border: "none" }}
    >
      {inner}
    </motion.button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function TodayQuickActions({
  orgSlug,
  accentColor,
  rollup,
  defaultReviewLink,
  recentContacts,
}: {
  orgSlug: string;
  accentColor: string;
  rollup: PipelineRollup;
  defaultReviewLink: string;
  recentContacts: RecentContact[];
}) {
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);

  const formatted =
    rollup.totalOpenValue === 0
      ? null
      : `$${rollup.totalOpenValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <>
      {/* Pipeline $ Card */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setPipelineOpen(true)}
        style={{
          width: "100%",
          borderRadius: 18,
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          padding: "18px 20px",
          textAlign: "left",
          cursor: "pointer",
          display: "block",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#AAA",
            marginBottom: 6,
          }}
        >
          Open Pipeline
        </p>
        {formatted ? (
          <p
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: accentColor,
              letterSpacing: "-1px",
              lineHeight: 1,
            }}
          >
            {formatted}
          </p>
        ) : (
          <p style={{ fontSize: 15, color: "#BBB" }}>No open deals — add your first deal from the Leads tab</p>
        )}
        {rollup.byStage.length > 0 && (
          <p style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
            {rollup.byStage.length} stage{rollup.byStage.length !== 1 ? "s" : ""} · tap to see breakdown
          </p>
        )}
      </motion.button>

      {/* Quick Actions Row */}
      <div style={{ display: "flex", gap: 10 }}>
        <QuickActionTile
          label="Add Contact"
          icon={IconUserPlus}
          onClick={() => setAddContactOpen(true)}
          accentColor={accentColor}
        />
        <QuickActionTile
          label="New Booking"
          icon={IconCalendarPlus}
          href={`/book/${orgSlug}/default`}
          accentColor={accentColor}
        />
        <QuickActionTile
          label="Request Review"
          icon={IconStar}
          onClick={() => setReviewOpen(true)}
          accentColor={accentColor}
        />
      </div>

      {/* Sheets */}
      <AddContactSheet
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        orgSlug={orgSlug}
        accentColor={accentColor}
      />
      <RequestReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        orgSlug={orgSlug}
        accentColor={accentColor}
        defaultReviewLink={defaultReviewLink}
        recentContacts={recentContacts}
      />
      <PipelineSheet
        open={pipelineOpen}
        onClose={() => setPipelineOpen(false)}
        rollup={rollup}
        accentColor={accentColor}
      />
    </>
  );
}
