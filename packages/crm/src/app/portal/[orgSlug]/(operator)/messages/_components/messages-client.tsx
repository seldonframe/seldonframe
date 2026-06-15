"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

type ThreadItem = {
  contactId: string;
  name: string;
  initial: string;
  lastBody: string;
  lastDirection: "inbound" | "outbound";
  lastMessageAt: string; // ISO string
  unreadCount: number;
};

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function snippet(body: string, max = 64): string {
  const t = body.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

type Tab = "all" | "unread";

export function MessagesClient({
  threads,
  base,
  accentColor,
}: {
  threads: ThreadItem[];
  base: string;
  accentColor: string;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
  }

  const filtered = useMemo(() => {
    let list = threads;
    if (tab === "unread") {
      list = list.filter((t) => t.unreadCount > 0);
    }
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.lastBody.toLowerCase().includes(q)
      );
    }
    return list;
  }, [threads, tab, debouncedQuery]);

  const isEmpty = filtered.length === 0;
  const emptyMsg =
    tab === "unread"
      ? "You're all caught up."
      : "No texts yet. Replies land here when a customer texts you.";

  return (
    <section className="flex flex-col gap-3 px-4 py-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Messages
        </h1>
      </header>

      {/* Segmented tabs */}
      <div
        className="flex rounded-xl p-1"
        style={{ backgroundColor: "#EEEEEA", border: "1px solid #E5E5E1" }}
        role="tablist"
        aria-label="Filter messages"
      >
        {(["all", "unread"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="flex-1 rounded-[9px] py-2 text-[13px] font-semibold transition-all"
            style={{
              backgroundColor: tab === t ? "#FFFFFF" : "transparent",
              color: tab === t ? "#111" : "#777",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              minHeight: 40,
            }}
          >
            {t === "all" ? "All" : "Unread"}
            {t === "unread" && threads.filter((th) => th.unreadCount > 0).length > 0 ? (
              <span
                className="ml-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 py-px text-[10px] font-bold text-white"
                style={{ backgroundColor: accentColor }}
              >
                {threads.filter((th) => th.unreadCount > 0).length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-2 rounded-xl px-3"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E5E1", height: 40 }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <path
            d="M10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM9.4 10.1l3 3-.7.8-3.1-3.1A5 5 0 1 1 9.4 10Z"
            fill="#999"
          />
        </svg>
        <input
          type="search"
          placeholder="Search by name or message…"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#AAA]"
          style={{ color: "#111" }}
        />
        {query ? (
          <button
            onClick={() => { setQuery(""); setDebouncedQuery(""); }}
            className="text-[#AAA] transition-opacity hover:text-[#555]"
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>

      {/* Thread list */}
      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div
              className="mb-4 flex size-14 items-center justify-center rounded-full"
              style={{ backgroundColor: "#F0F0EC" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Z"
                  fill="#CCC"
                />
              </svg>
            </div>
            <p className="text-[14px] font-medium" style={{ color: "#555" }}>
              {emptyMsg}
            </p>
          </motion.div>
        ) : (
          <motion.ul
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden rounded-2xl bg-white"
            style={{ border: "1px solid #E5E5E1" }}
          >
            {filtered.map((t, i) => (
              <motion.li
                key={t.contactId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
                style={{ borderTop: i === 0 ? "none" : "1px solid #EFEFEC" }}
              >
                <Link
                  href={`${base}/messages/${t.contactId}`}
                  className="flex items-start gap-3 px-4 py-3.5"
                  style={{ minHeight: 56 }}
                >
                  {/* Avatar */}
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold"
                    style={{
                      backgroundColor: t.unreadCount > 0 ? accentColor + "18" : "#F0F0EC",
                      color: t.unreadCount > 0 ? accentColor : "#555",
                      border: t.unreadCount > 0 ? `1.5px solid ${accentColor}40` : "none",
                    }}
                  >
                    {t.initial}
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className="truncate text-[14px]"
                        style={{
                          color: "#111",
                          fontWeight: t.unreadCount > 0 ? 700 : 600,
                        }}
                      >
                        {t.name}
                      </p>
                      <span className="shrink-0 text-[11px]" style={{ color: "#AAA" }}>
                        {formatRelative(t.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p
                        className="min-w-0 flex-1 truncate text-[12px]"
                        style={{ color: t.unreadCount > 0 ? "#444" : "#888" }}
                      >
                        {t.lastDirection === "outbound" ? (
                          <span style={{ color: "#AAA" }}>You: </span>
                        ) : null}
                        {snippet(t.lastBody)}
                      </p>
                      {t.unreadCount > 0 ? (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ backgroundColor: accentColor }}
                        >
                          {t.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
