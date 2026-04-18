"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Briefcase, Building2, Calendar, ChevronRight, FileText, Layout, LayoutDashboard, Mail, Puzzle, Settings, Sparkles, Users, Zap } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  disabled?: boolean;
  tooltip?: string;
  upgrade?: boolean;
};

export type NavGroup = {
  title?: string;
  items: NavItem[];
};

const iconMap = {
  dashboard: LayoutDashboard,
  layoutdashboard: LayoutDashboard,
  bookopen: BookOpen,
  contacts: Users,
  users: Users,
  deals: Briefcase,
  briefcase: Briefcase,
  building2: Building2,
  booking: Calendar,
  calendar: Calendar,
  pages: Layout,
  layout: Layout,
  email: Mail,
  mail: Mail,
  forms: FileText,
  filetext: FileText,
  automations: Zap,
  zap: Zap,
  settings: Settings,
  sparkles: Sparkles,
  puzzle: Puzzle,
} as const;

function resolveIcon(iconName: string) {
  const normalized = iconName.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return iconMap[normalized as keyof typeof iconMap] ?? Puzzle;
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItemLink({ item, pathname, onNavigate, icon: Icon }: { item: NavItem; pathname: string; onNavigate?: () => void; icon: React.ComponentType<{ className?: string }> }) {
  const active = isActivePath(pathname, item.href);
  const className = item.disabled
    ? "crm-sidebar-link cursor-not-allowed border border-transparent px-3.5 text-sm font-medium opacity-55"
    : "crm-sidebar-link border px-3.5 text-sm font-medium";

  return (
    <Link
      href={item.href}
      data-active={item.disabled ? false : active}
      className={className}
      title={item.tooltip}
      onClick={() => {
        if (!item.disabled) {
          onNavigate?.();
        }
      }}
    >
      <Icon className={`crm-sidebar-icon size-4 shrink-0 ${active && !item.disabled ? "text-primary" : ""}`} />
      <span className="crm-sidebar-text flex-1 text-[13px] sm:text-sm">{item.label}</span>
      {active && !item.disabled ? <ChevronRight className="h-4 w-4 text-muted-foreground/70" /> : null}
      {item.upgrade ? (
        <span className="rounded-md border border-border bg-card/70 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Upgrade
        </span>
      ) : null}
    </Link>
  );
}

export function SidebarNav({ nav, groups, onNavigate }: { nav?: NavItem[]; groups?: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  const resolvedGroups: NavGroup[] = groups && groups.length > 0
    ? groups
    : nav
      ? [{ items: nav }]
      : [];

  return (
    <nav className="space-y-5">
      {resolvedGroups.map((group, groupIndex) => (
        <div key={group.title ?? `group-${groupIndex}`} className="space-y-1">
          {group.title ? (
            <p className="px-3.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">{group.title}</p>
          ) : null}
          {group.items.map((item) => (
            <NavItemLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} icon={resolveIcon(item.icon)} />
          ))}
        </div>
      ))}
    </nav>
  );
}
