"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "test", label: "Sandbox" },
  { slug: "conversations", label: "Conversations" },
  { slug: "settings", label: "Settings" },
  { slug: "evals", label: "Evals" },
  { slug: "improve", label: "Improve" },
];

export function AgentTabs({ agentId }: { agentId: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((t) => {
        const href = t.slug ? `/agents/${agentId}/${t.slug}` : `/agents/${agentId}`;
        const isActive = t.slug
          ? pathname.startsWith(href)
          : pathname === href;
        return (
          <Link
            key={t.slug || "overview"}
            href={href}
            className={`relative px-4 py-2 text-sm border-b-2 -mb-px transition-[color,border-color,background-color] duration-150 ease-out rounded-t-md ${
              isActive
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
