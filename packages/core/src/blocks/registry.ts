export type BlockManifest = {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  routes: string[];
  nav: {
    href: string;
    label: string;
    icon: string;
    order: number;
  };
  provides: string[];
  consumes: string[];
  events: {
    emits: string[];
    listens: string[];
  };
  soul: {
    usesVoice: boolean;
    usesBranding: boolean;
  };
  canDisable: boolean;
  dependencies: string[];
};

export const BUILT_IN_BLOCKS: BlockManifest[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Org overview and KPI summaries",
    icon: "LayoutDashboard",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/dashboard"],
    nav: { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", order: 10 },
    provides: ["analytics"],
    consumes: [],
    events: { emits: [], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
  {
    id: "contacts",
    name: "Contacts",
    description: "Contact records and relationship data",
    icon: "Users",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/contacts"],
    nav: { href: "/contacts", label: "Contacts", icon: "Users", order: 20 },
    provides: ["contacts"],
    consumes: [],
    events: { emits: ["contact.created", "contact.updated"], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
  {
    id: "deals",
    name: "Deals",
    description: "Pipeline and opportunity management",
    icon: "Briefcase",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/deals"],
    nav: { href: "/deals", label: "Deals", icon: "Briefcase", order: 30 },
    provides: ["pipeline"],
    consumes: ["contacts"],
    events: { emits: ["deal.stage_changed"], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
  {
    id: "bookings",
    name: "Booking",
    description: "Scheduling and public booking pages",
    icon: "Calendar",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/bookings"],
    nav: { href: "/bookings", label: "Booking", icon: "Calendar", order: 40 },
    provides: ["booking"],
    consumes: ["contacts"],
    events: { emits: ["booking.created", "booking.completed", "booking.cancelled"], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
  {
    id: "landing",
    name: "Pages",
    description: "Landing page builder and publishing",
    icon: "Layout",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/landing"],
    nav: { href: "/landing", label: "Pages", icon: "Layout", order: 50 },
    provides: ["pages"],
    consumes: [],
    events: { emits: ["landing.visited", "landing.converted"], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
  {
    id: "emails",
    name: "Email",
    description: "Email templates and outbound messaging",
    icon: "Mail",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/emails"],
    nav: { href: "/emails", label: "Email", icon: "Mail", order: 60 },
    provides: ["email"],
    consumes: ["contacts"],
    events: { emits: ["email.sent", "email.opened", "email.clicked"], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
  {
    id: "forms",
    name: "Forms",
    description: "Intake forms and lead capture",
    icon: "FileText",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/forms"],
    nav: { href: "/forms", label: "Forms", icon: "FileText", order: 70 },
    provides: ["forms"],
    consumes: ["contacts"],
    events: { emits: ["form.submitted"], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
  {
    id: "automations",
    name: "Automations",
    description: "Event-driven workflow automation",
    icon: "Zap",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/automations"],
    nav: { href: "/automations", label: "Automations", icon: "Zap", order: 80 },
    provides: ["automations"],
    consumes: ["contacts", "email", "booking"],
    events: { emits: [], listens: ["contact.created", "form.submitted", "booking.completed"] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
  {
    id: "settings",
    name: "Settings",
    description: "Workspace settings and integrations",
    icon: "Settings",
    version: "1.0.0",
    author: "SeldonFrame",
    routes: ["/settings"],
    nav: { href: "/settings", label: "Settings", icon: "Settings", order: 90 },
    provides: [],
    consumes: [],
    events: { emits: [], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  },
];

export function mergeBlockManifests(params: {
  enabledBlockIds: string[];
  marketplaceBlocks: BlockManifest[];
}) {
  const enabledSet = new Set(params.enabledBlockIds);
  const allBlocks = [...BUILT_IN_BLOCKS, ...params.marketplaceBlocks];

  return allBlocks.filter((block) => !block.canDisable || enabledSet.has(block.id));
}

export function createMarketplaceManifest(input: {
  id: string;
  name?: string | null;
  description?: string | null;
  icon?: string | null;
  author?: string | null;
  route?: string | null;
  order?: number | null;
}) {
  const safeId = input.id;
  const safeName = input.name || safeId;
  const safeDescription = input.description || "Marketplace block";
  const safeIcon = input.icon || "Puzzle";
  const safeRoute = input.route || `/${safeId}`;
  const safeOrder = Number.isFinite(input.order) ? Number(input.order) : 80;

  return {
    id: safeId,
    name: safeName,
    description: safeDescription,
    icon: safeIcon,
    version: "1.0.0",
    author: input.author || "Marketplace Seller",
    routes: [safeRoute],
    nav: {
      href: safeRoute,
      label: safeName,
      icon: safeIcon,
      order: safeOrder,
    },
    provides: [],
    consumes: ["contacts"],
    events: { emits: [], listens: [] },
    soul: { usesVoice: true, usesBranding: true },
    canDisable: true,
    dependencies: ["crm"],
  } satisfies BlockManifest;
}
