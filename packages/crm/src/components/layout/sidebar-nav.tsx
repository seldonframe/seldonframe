"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Building2, Calendar, ChevronRight, FileText, Layout, LayoutDashboard, Mail, Puzzle, Settings, Sparkles, Users, Zap } from "lucide-react";

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
    ? "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-muted-foreground opacity-55 sm:h-[38px]"
    : `flex h-9 items-center gap-2.5 rounded-md border-l-[3px] px-3 text-sm font-medium transition-colors sm:h-[38px] ${active ? "border-l-primary bg-primary/8 text-foreground" : "border-l-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`;

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
      <Icon className={`size-4 shrink-0 sm:size-5 ${active && !item.disabled ? "text-primary" : ""}`} />
      <span className="flex-1">{item.label}</span>
      {active && !item.disabled ? <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]/70" /> : null}
      {item.upgrade ? (
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-[hsl(var(--muted-foreground))]">
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
    <nav className="space-y-4">
      {resolvedGroups.map((group, groupIndex) => (
        <div key={group.title ?? `group-${groupIndex}`} className="space-y-0.5">
          {group.title ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.title}</p>
          ) : null}
          {group.items.map((item) => (
            <NavItemLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} icon={resolveIcon(item.icon)} />
          ))}
        </div>
      ))}
    </nav>
  );
}
