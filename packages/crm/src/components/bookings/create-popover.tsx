"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
};

type BookingTypeRow = {
  id: string;
  title: string;
  bookingSlug: string;
  metadata: unknown;
};

type BookingTypeMeta = {
  durationMinutes?: number;
};

export type CreatePopoverProps = {
  /** Clicked start time as a UTC Date. */
  startsAt: Date;
  /** IANA timezone of the workspace — used for display only. */
  workspaceTimezone: string;
  contacts: ContactRow[];
  bookingTypes: BookingTypeRow[];
  /** Viewport pixel position of the originating click. Vestigial now that the
   *  popover renders as a viewport-centered modal (no longer anchored to the
   *  clicked cell); kept optional so existing callers compile unchanged. */
  anchorX?: number;
  anchorY?: number;
  createBookingAction: (formData: FormData) => Promise<unknown>;
  createBlockedTimeAction: (input: {
    label: string;
    startsAtISO: string;
    durationMinutes: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Called after a successful create/block so the parent can refresh the
   *  calendar (router.refresh()) — new bookings/blocks then show without a
   *  manual page refresh. */
  onCreated?: () => void;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLocalTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function contactDisplayName(c: ContactRow) {
  return `${c.firstName} ${c.lastName ?? ""}`.trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreatePopover({
  startsAt,
  workspaceTimezone,
  contacts,
  bookingTypes,
  createBookingAction,
  createBlockedTimeAction,
  onCreated,
  onClose,
}: CreatePopoverProps) {
  const [tab, setTab] = useState<"book" | "block">("book");
  const [query, setQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<ContactRow | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  // New-customer fields. These are ALWAYS visible whenever no existing contact
  // is linked — the operator can just type a name/phone/address and book. When
  // they instead pick an existing contact from the optional search, the contact
  // is linked (chip) and these fields are hidden. Only first name is required.
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  // Address of the new contact's job site. The contacts table has no address
  // column, so on submit it's folded into the booking notes server-side as an
  // "Address: …" line. Only collected on the new-contact path.
  const [newAddress, setNewAddress] = useState("");
  // Notes / job details for the booking — applies regardless of new-vs-existing
  // contact (local-service operators capture gate codes, scope of work, etc.).
  const [notes, setNotes] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState(bookingTypes[0]?.id ?? "");
  const [blockLabel, setBlockLabel] = useState("");
  const [blockDuration, setBlockDuration] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focused on open so keyboard users land inside the modal (basic a11y) and a
  // stray Enter doesn't submit the page behind it. The search input is hidden
  // on the "block" tab, so fall back to the card itself.
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Portal to document.body so the `fixed inset-0` backdrop covers the real
  // VIEWPORT rather than the nearest transformed ancestor. The dashboard shell
  // and the /bookings page section both carry `.animate-page-enter`, whose
  // keyframes animate `transform` with fill-mode `both` — a non-`none`
  // transform permanently establishes a containing block for fixed
  // descendants, so without the portal this overlay would be sized/positioned
  // against that tall section (dropping the card below the fold) instead of the
  // screen. Mounted gate keeps the portal client-only (no SSR `document`).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Close on Escape. (Backdrop click is handled on the overlay element below —
  // no document mousedown listener, so clicks INSIDE the modal never bubble out
  // and accidentally dismiss it.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move focus into the modal on open: the search field on the "book" tab,
  // otherwise the close button (the search input isn't mounted on "block").
  useEffect(() => {
    (inputRef.current ?? closeBtnRef.current)?.focus();
    // Run once on mount; tab changes shouldn't steal focus mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered contact suggestions.
  const filtered =
    query.trim().length === 0
      ? []
      : contacts.filter((c) =>
          contactDisplayName(c).toLowerCase().includes(query.trim().toLowerCase())
        );

  // Duration of selected booking type.
  const selectedType = bookingTypes.find((t) => t.id === selectedTypeId);
  const selectedTypeDuration = (selectedType?.metadata as BookingTypeMeta | null)?.durationMinutes ?? 30;

  function handleBookSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("startsAt", startsAt.toISOString());
    fd.set("durationMinutes", String(selectedTypeDuration));
    fd.set("title", selectedType?.title ?? "Consultation");
    fd.set("bookingSlug", selectedType?.bookingSlug ?? "default");
    if (selectedContact) {
      // An existing contact is linked — send its id so the booking attaches to
      // the known contact (no new contact created).
      fd.set("contactId", selectedContact.id);
      fd.set("fullName", contactDisplayName(selectedContact));
    } else {
      // No existing contact linked — create one from the always-visible
      // new-customer fields. Only first name is required; the rest are
      // optional. Field names below MUST match exactly what createBookingAction
      // reads (newContactFirstName / newContactLastName / newContactEmail /
      // newContactPhone / newContactAddress).
      const first = newFirstName.trim();
      if (!first) {
        setError("First name is required to create a contact.");
        return;
      }
      const last = newLastName.trim();
      fd.set("newContactFirstName", first);
      if (last) fd.set("newContactLastName", last);
      if (newEmail.trim()) fd.set("newContactEmail", newEmail.trim());
      if (newPhone.trim()) fd.set("newContactPhone", newPhone.trim());
      if (newAddress.trim()) fd.set("newContactAddress", newAddress.trim());
      fd.set("fullName", `${first} ${last}`.trim());
    }
    // Notes / job details apply regardless of new-vs-existing contact.
    if (notes.trim()) fd.set("notes", notes.trim());
    startTransition(async () => {
      try {
        await createBookingAction(fd);
        onCreated?.();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create booking.");
      }
    });
  }

  function handleBlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBlockedTimeAction({
        label: blockLabel.trim() || "Blocked",
        startsAtISO: startsAt.toISOString(),
        durationMinutes: blockDuration,
      });
      if ("ok" in result && !result.ok) {
        setError((result as { ok: false; error: string }).error);
        return;
      }
      onCreated?.();
      onClose();
    });
  }

  // Client-only: the portal target (document.body) doesn't exist during SSR.
  if (!mounted) return null;

  return createPortal(
    // Full-viewport backdrop layer: dims the page and centers the card in the
    // MIDDLE OF THE SCREEN regardless of which cell was clicked, so a click on a
    // low row no longer drops the popup near the bottom of the page. Rendered
    // through a portal to document.body so `fixed inset-0` is viewport-relative
    // (an `.animate-page-enter` ancestor's transform would otherwise scope it).
    // Clicking the backdrop closes; clicks inside the card stopPropagation so
    // they don't reach the backdrop (or the calendar column behind it).
    // Reduced-motion safe — no animation. The clicked slot's datetime still
    // flows in via the `startsAt` prop and is unchanged.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create booking or block time"
      onClick={onClose}
    >
    <div
      ref={popoverRef}
      className="w-full max-w-[360px] rounded-xl border border-border bg-card shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => { setTab("book"); setError(null); }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === "book"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Book prospect
          </button>
          <button
            type="button"
            onClick={() => { setTab("block"); setError(null); }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === "block"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Block time
          </button>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Start time display */}
      <div className="px-4 pt-3">
        <p className="text-xs text-muted-foreground">
          {formatLocalTime(startsAt, workspaceTimezone)}
        </p>
      </div>

      {/* Body */}
      <div className="px-4 pb-4 pt-3">
        {tab === "book" ? (
          <form onSubmit={handleBookSubmit} className="space-y-3">
            {/* Optional: link an existing customer. Typing filters the org's
                contacts; clicking a match links it (chip) and hides the
                new-customer fields. Leaving this empty is the common case —
                the operator just fills in the new-customer fields below. */}
            <div className="relative">
              <label className="mb-1 block text-xs text-muted-foreground">
                Search existing customer
              </label>
              {selectedContact ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                  <span className="flex-1 truncate text-foreground">
                    {contactDisplayName(selectedContact)}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSelectedContact(null); setQuery(""); }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove linked customer"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  className="crm-input h-8 w-full px-3 text-sm"
                  placeholder="Search existing customer…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  autoComplete="off"
                />
              )}
              {/* Match dropdown — only existing contacts, no "+ create" entry.
                  Uses onClick + stopPropagation (not onMouseDown) so the link
                  fires cleanly without the popover's outside-click swallowing
                  it. */}
              {showDropdown && !selectedContact && query.trim().length > 0 && filtered.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-card shadow-sm">
                  {filtered.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedContact(c);
                        setQuery(contactDisplayName(c));
                        setShowDropdown(false);
                      }}
                    >
                      {contactDisplayName(c)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* New-customer fields — ALWAYS visible whenever no existing
                contact is linked. Only first name is required; phone, email
                and address are optional. Address is folded into the booking
                notes server-side as an "Address: …" line. */}
            {!selectedContact ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      First name *
                    </label>
                    <input
                      type="text"
                      className="crm-input h-8 w-full px-3 text-sm"
                      placeholder="Jane"
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Last name
                    </label>
                    <input
                      type="text"
                      className="crm-input h-8 w-full px-3 text-sm"
                      placeholder="Doe"
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Phone
                  </label>
                  <input
                    type="tel"
                    className="crm-input h-8 w-full px-3 text-sm"
                    placeholder="(555) 123-4567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Email
                  </label>
                  <input
                    type="email"
                    className="crm-input h-8 w-full px-3 text-sm"
                    placeholder="jane@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Address
                  </label>
                  <input
                    type="text"
                    className="crm-input h-8 w-full px-3 text-sm"
                    placeholder="123 Main St"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            ) : null}

            {/* Appointment type */}
            {bookingTypes.length > 0 ? (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Appointment type
                </label>
                <select
                  className="crm-input h-8 w-full px-3 text-sm"
                  value={selectedTypeId}
                  onChange={(e) => setSelectedTypeId(e.target.value)}
                >
                  {bookingTypes.map((t) => {
                    const dur = (t.metadata as BookingTypeMeta | null)?.durationMinutes ?? 30;
                    return (
                      <option key={t.id} value={t.id}>
                        {t.title} ({dur} min)
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No appointment types yet — create one first.
              </p>
            )}

            {/* Notes / job details — applies to the booking regardless of
                new-vs-existing contact (gate codes, scope of work, etc.). */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Notes / job details
              </label>
              <textarea
                className="crm-input w-full px-3 py-2 text-sm"
                rows={3}
                placeholder="Scope of work, gate code, parking, anything the tech needs…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error ? (
              <p className="text-xs text-negative">{error}</p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="crm-button-primary h-8 flex-1 text-xs"
                disabled={pending || bookingTypes.length === 0}
              >
                {pending ? "Saving…" : "Book"}
              </button>
              <button
                type="button"
                className="crm-button-secondary h-8 px-3 text-xs"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBlockSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Label
              </label>
              <input
                type="text"
                className="crm-input h-8 w-full px-3 text-sm"
                placeholder="Lunch, Travel, Focus time…"
                value={blockLabel}
                onChange={(e) => setBlockLabel(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Duration
              </label>
              <select
                className="crm-input h-8 w-full px-3 text-sm"
                value={blockDuration}
                onChange={(e) => setBlockDuration(Number(e.target.value))}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>

            {error ? (
              <p className="text-xs text-negative">{error}</p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="crm-button-primary h-8 flex-1 text-xs"
                disabled={pending}
              >
                {pending ? "Saving…" : "Block"}
              </button>
              <button
                type="button"
                className="crm-button-secondary h-8 px-3 text-xs"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
    </div>,
    document.body,
  );
}
