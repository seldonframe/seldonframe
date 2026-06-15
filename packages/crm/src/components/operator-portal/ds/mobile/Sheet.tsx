"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export function DSSheet({
  open = true,
  onClose,
  title,
  children,
  footer,
  maxHeight = "86vh",
  style = {},
}: {
  open?: boolean;
  onClose?: () => void;
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string;
  style?: React.CSSProperties;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim */}
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--scrim)",
              zIndex: 50,
            }}
          />
          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              translateX: "-50%",
              width: "min(100vw, 640px)",
              maxHeight,
              display: "flex",
              flexDirection: "column",
              background: "var(--surface-overlay)",
              borderTopLeftRadius: "var(--radius-xl)",
              borderTopRightRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-sheet)",
              paddingBottom: "var(--safe-bottom)",
              zIndex: 51,
              ...style,
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px" }}>
              <span
                style={{
                  width: "38px",
                  height: "4px",
                  borderRadius: "999px",
                  background: "var(--gray-300)",
                }}
              />
            </div>
            {title && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "8px 16px 12px",
                  borderBottom: "1px solid var(--border-hairline)",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: "var(--type-title)",
                    fontWeight: "var(--weight-bold)" as React.CSSProperties["fontWeight"],
                    letterSpacing: "var(--track-title)",
                    color: "var(--text-primary)",
                  }}
                >
                  {title}
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    border: "none",
                    background: "var(--surface-sunken)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <div style={{ overflowY: "auto", padding: "16px", flex: 1 }}>{children}</div>
            {footer && (
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid var(--border-hairline)",
                  background: "var(--surface-card)",
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
