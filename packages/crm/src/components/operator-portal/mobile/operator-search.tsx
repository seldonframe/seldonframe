"use client";

// Operator universal search overlay — debounced (300ms), grouped results,
// framer-motion stagger, 48px tap targets, backdrop blur, slide-down.

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { operatorSearchAction } from "@/lib/operator-portal/search-actions";
import type { UniversalSearchResult } from "@/lib/operator-portal/search";

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className="h-9 w-9 shrink-0 rounded-full animate-pulse"
        style={{ backgroundColor: "#E5E5E1" }}
      />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="h-3.5 w-32 rounded animate-pulse" style={{ backgroundColor: "#E5E5E1" }} />
        <div className="h-3 w-24 rounded animate-pulse" style={{ backgroundColor: "#F0F0EE" }} />
      </div>
    </div>
  );
}

// ─── Result row ──────────────────────────────────────────────────────────────

const TYPE_EMOJI: Record<string, string> = {
  contact: "👤",
  deal: "💼",
  booking: "📅",
};

function ResultRow({
  result,
  onClose,
  index,
}: {
  result: UniversalSearchResult;
  onClose: () => void;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.18 }}
    >
      <Link
        href={result.href}
        onClick={onClose}
        className="flex items-center gap-3 px-4 active:bg-gray-50 transition-colors"
        style={{ minHeight: "48px" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
          style={{ backgroundColor: "#F0F0EE" }}
        >
          {TYPE_EMOJI[result.type] ?? "?"}
        </div>
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <span className="truncate text-[14px] font-medium" style={{ color: "#111" }}>
            {result.title}
          </span>
          {result.subtitle ? (
            <span className="truncate text-[12px]" style={{ color: "#999" }}>
              {result.subtitle}
            </span>
          ) : null}
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  contact: "CONTACTS",
  deal: "DEALS",
  booking: "APPOINTMENTS",
};

function ResultGroup({
  type,
  results,
  onClose,
  baseIndex,
}: {
  type: string;
  results: UniversalSearchResult[];
  onClose: () => void;
  baseIndex: number;
}) {
  if (results.length === 0) return null;
  return (
    <div>
      <div
        className="px-4 py-1.5 text-[11px] font-semibold tracking-wider"
        style={{ color: "#AAA8A0", letterSpacing: "0.08em" }}
      >
        {GROUP_LABELS[type] ?? type.toUpperCase()}
      </div>
      {results.map((r, i) => (
        <ResultRow key={r.id} result={r} onClose={onClose} index={baseIndex + i} />
      ))}
    </div>
  );
}

// ─── Main overlay component ───────────────────────────────────────────────────

export function OperatorSearch({
  orgSlug,
  activeColor,
}: {
  orgSlug: string;
  activeColor: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UniversalSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus input when overlay opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim() || value.trim().length < 2) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(() => {
        startTransition(async () => {
          const res = await operatorSearchAction({ orgSlug, query: value });
          setResults(res);
        });
      }, 300);
    },
    [orgSlug]
  );

  // Group results
  const contacts = results.filter((r) => r.type === "contact");
  const deals = results.filter((r) => r.type === "deal");
  const bookings = results.filter((r) => r.type === "booking");
  const hasResults = results.length > 0;
  const showNoResults = query.trim().length >= 2 && !isPending && !hasResults;

  return (
    <>
      {/* Search icon button in the header */}
      <button
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        style={{ color: "#666", backgroundColor: "transparent" }}
      >
        <SearchIcon />
      </button>

      {/* Full-screen overlay */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={handleClose}
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.3)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                zIndex: 40,
              }}
            />

            {/* Slide-down search panel */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: "spring", damping: 28, stiffness: 400 }}
              style={{
                position: "fixed",
                top: 0,
                left: "50%",
                x: "-50%",
                width: "min(100vw, 640px)",
                backgroundColor: "#FFFFFF",
                zIndex: 41,
                borderRadius: "0 0 20px 20px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                maxHeight: "80dvh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Search input row */}
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: "1px solid #F0F0EE" }}
              >
                <div style={{ color: "#AAA8A0", flexShrink: 0 }}>
                  <SearchIcon />
                </div>
                <input
                  ref={inputRef}
                  type="search"
                  placeholder="Search contacts, deals, bookings…"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#CCC]"
                  style={{ color: "#111", minHeight: "32px" }}
                />
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={handleClose}
                  className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                  style={{ color: "#999", backgroundColor: "#F5F5F3" }}
                >
                  <XIcon />
                </button>
              </div>

              {/* Results container */}
              <div className="overflow-y-auto" style={{ flex: 1 }}>
                {/* Loading skeletons */}
                {isPending && (
                  <div>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </div>
                )}

                {/* Results grouped */}
                {!isPending && hasResults && (
                  <div className="pb-4 pt-2">
                    <ResultGroup type="contact" results={contacts} onClose={handleClose} baseIndex={0} />
                    <ResultGroup type="deal" results={deals} onClose={handleClose} baseIndex={contacts.length} />
                    <ResultGroup type="booking" results={bookings} onClose={handleClose} baseIndex={contacts.length + deals.length} />
                  </div>
                )}

                {/* No results */}
                {showNoResults && (
                  <div
                    className="px-4 py-8 text-center text-[14px]"
                    style={{ color: "#999" }}
                  >
                    No results for &ldquo;{query}&rdquo;
                  </div>
                )}

                {/* Prompt to type (idle state) */}
                {!isPending && !hasResults && !showNoResults && query.length > 0 && query.trim().length < 2 && (
                  <div
                    className="px-4 py-6 text-center text-[13px]"
                    style={{ color: "#CCC" }}
                  >
                    Type at least 2 characters to search
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
