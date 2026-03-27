"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

const items = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Contacts", href: "/contacts" },
  { label: "Deals", href: "/deals" },
  { label: "Activities", href: "/activities" },
  { label: "Settings", href: "/settings" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((current) => !current);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    const onToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      if (typeof customEvent.detail?.open === "boolean") {
        setOpen(customEvent.detail.open);
        return;
      }

      setOpen((current) => !current);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("crm:command-palette-toggle", onToggle as EventListener);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("crm:command-palette-toggle", onToggle as EventListener);
    };
  }, []);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="crm-modal-backdrop fixed inset-0 z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.2, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="crm-modal-surface crm-command-palette mx-auto mt-24 max-w-xl border border-border bg-card p-2"
            onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
          >
            <Command>
              <Command.Input className="crm-input mb-2 h-11 w-full px-3 text-[18px]" placeholder="Type a command or search..." />
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                <Command.List>
                  {items.map((item) => (
                    <Command.Item
                      key={item.href}
                      className="cursor-pointer rounded-md px-3 py-2 text-sm transition-colors data-[selected=true]:bg-[hsl(var(--muted))]"
                      onSelect={() => {
                        router.push(item.href);
                        setOpen(false);
                      }}
                    >
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.List>
              </motion.div>
            </Command>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
