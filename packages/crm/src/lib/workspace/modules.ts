// Simple-home module registry — pure constants describing the owner-facing
// modules of a workspace. No DB, no framework imports; later tasks in the
// simple-home wave import these exact names (ModuleId, MODULE_IDS,
// DEFAULT_FRESH_MODULES, MODULE_REGISTRY).

export type ModuleId =
  | "home"
  | "website"
  | "bookings"
  | "customers"
  | "leads"
  | "inbox"
  | "messaging"
  | "money"
  | "agents"
  | "integrations";

export const MODULE_IDS: readonly ModuleId[] = [
  "home",
  "website",
  "bookings",
  "customers",
  "leads",
  "inbox",
  "messaging",
  "money",
  "agents",
  "integrations",
] as const;

/** Modules a brand-new workspace starts with turned on. */
export const DEFAULT_FRESH_MODULES: readonly ModuleId[] = [
  "home",
  "website",
  "bookings",
  "customers",
] as const;

export interface ModuleDef {
  id: ModuleId;
  label: string;
  description: string;
  alwaysOn: boolean;
}

/** Owner-language labels/descriptions for each module. `home` is always on. */
export const MODULE_REGISTRY: readonly ModuleDef[] = [
  { id: "home", label: "Home", description: "Your overview", alwaysOn: true },
  {
    id: "website",
    label: "Website",
    description: "Your public website and how it looks",
    alwaysOn: false,
  },
  {
    id: "bookings",
    label: "Bookings",
    description: "Your calendar and appointments",
    alwaysOn: false,
  },
  {
    id: "customers",
    label: "Customers",
    description: "People, deals, and follow-ups",
    alwaysOn: false,
  },
  {
    id: "leads",
    label: "Lead forms",
    description: "Forms that turn visitors into customers",
    alwaysOn: false,
  },
  {
    id: "inbox",
    label: "Inbox",
    description: "Messages from your customers in one place",
    alwaysOn: false,
  },
  {
    id: "messaging",
    label: "Texting",
    description: "Send and receive text messages",
    alwaysOn: false,
  },
  {
    id: "money",
    label: "Money",
    description: "Invoices and payments",
    alwaysOn: false,
  },
  {
    id: "agents",
    label: "AI staff",
    description: "Assistants that answer, book, and follow up",
    alwaysOn: false,
  },
  {
    id: "integrations",
    label: "Connected apps",
    description: "Google Calendar, Gmail, and more",
    alwaysOn: false,
  },
] as const;
