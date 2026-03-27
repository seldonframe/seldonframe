"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEMO_BLOCK_MESSAGE, DEMO_REPO_URL } from "@/lib/demo/constants";

type DemoToastContextValue = {
  showDemoToast: () => void;
};

const DemoToastContext = createContext<DemoToastContextValue | null>(null);

export function DemoToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const showDemoToast = useCallback(() => {
    setVisible(true);
    window.setTimeout(() => setVisible(false), 5000);
  }, []);

  const value = useMemo(() => ({ showDemoToast }), [showDemoToast]);

  return (
    <DemoToastContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {visible ? (
          <motion.div
            key="demo-toast"
            initial={{ opacity: 0, y: 24, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 16, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="crm-toast fixed bottom-4 right-4 z-[70] w-full max-w-sm overflow-hidden border border-border bg-card p-4 text-sm"
          >
            <p className="text-label text-foreground">{DEMO_BLOCK_MESSAGE}</p>
            <Link href={DEMO_REPO_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4">
              Fork on GitHub
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DemoToastContext.Provider>
  );
}

export function useDemoToast() {
  const context = useContext(DemoToastContext);

  if (!context) {
    throw new Error("useDemoToast must be used within DemoToastProvider");
  }

  return context;
}
