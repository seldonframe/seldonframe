// Marketplace buyer onboarding — the "My Agent" home VIEW + reads.
//
// The round-trip endpoint: after a buyer sets up + goes live, this is where they
// land (and return to). It shows ONE deployment's: status + identity + channels,
// this-week stats, a recent-activity feed (calls / bookings with outcome badges),
// Configure cards that deep-link back into a wizard step, and a Billing panel.
//
// Layering (repo convention): a PURE view assembler (`buildMyAgentHomeView`) over
// already-loaded rows + a DI'd reader (`getBuyerAgentHome`) with lazy DB-backed
// default deps the unit tests never import. No Postgres in the pure path.
//
// WHERE the activity lives: a deployed agent writes its conversations / bookings
// into the deployment's provisioned CLIENT workspace (`clientOrgId`) when one
// exists, else it falls back to the owning org (`builderOrgId`) — exactly the
// deployments-schema contract. A marketplace BUYER runs the agent themselves, so
// `clientOrgId` is usually null and the activity lands in the buyer's own org.
// `activityOrgId = clientOrgId ?? builderOrgId` is therefore the org to read, and
// it is ALWAYS the buyer's own data (the buyer owns both orgs).

import type { BuyerAgentView } from "@/lib/marketplace/buyer/buyer-deployment";
import { buyerSetupPath } from "@/lib/marketplace/buyer/buyer-routes";
import type { OnboardingStepKind } from "@/lib/marketplace/onboarding/steps";

// ─── raw read row shapes (the subset the view reads) ─────────────────────────

/** One agent conversation row (the subset the home feed needs). */
export type HomeConversationRow = {
  id: string;
  status: string; // 'active' | 'completed' | 'escalated' | 'abandoned' | 'test'
  startedAt: Date | string;
  lastTurnAt: Date | string;
  /** A short label for the conversation (first user message / caller), if known. */
  preview?: string | null;
};

/** One booking row (the subset the home feed + cards need). */
export type HomeBookingRow = {
  id: string;
  title: string;
  status: string; // 'scheduled' | 'completed' | 'cancelled' | 'template'
  startsAt: Date | string;
  fullName?: string | null;
};

// ─── view types (serializable; what the client renders) ──────────────────────

export type HomeStatus = "live" | "setting_up" | "paused";

export type HomeStat = { label: string; value: string };

export type HomeActivityBadgeTone = "pos" | "info" | "amber" | "neutral";

export type HomeActivityItem = {
  id: string;
  /** A small glyph the client maps to an icon ('phone' | 'calendar' | 'chat'). */
  icon: "phone" | "calendar" | "chat";
  title: string;
  detail: string;
  /** Relative time, e.g. "2h ago". */
  time: string;
  badgeLabel: string;
  badgeTone: HomeActivityBadgeTone;
};

export type HomeBookingCard = {
  id: string;
  service: string;
  customer: string;
  when: string;
};

export type HomeConfigureCard = {
  kind: OnboardingStepKind;
  title: string;
  sub: string;
  /** Deep-link back into the wizard at this step. */
  href: string;
};

export type HomeBilling = {
  plan: string;
  /** Display price, e.g. "$49/mo" or "Free". */
  price: string;
  /** Whether a "Manage billing" portal is available (a paid purchase exists). */
  canManage: boolean;
};

export type MyAgentHomeView = {
  /** The agent's display name + the business it speaks as. */
  name: string;
  businessName: string;
  status: HomeStatus;
  /** The provisioned number (E.164) or null. */
  phoneNumber: string | null;
  /** Channel chips, e.g. ["Phone", "SMS"] / ["Web chat"]. */
  channels: string[];
  weekStats: HomeStat[];
  activity: HomeActivityItem[];
  bookings: HomeBookingCard[];
  configure: HomeConfigureCard[];
  billing: HomeBilling;
};

// ─── helpers (pure) ──────────────────────────────────────────────────────────

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/** A compact "2h ago" / "3d ago" relative label. */
function relativeTime(when: Date | string, now: Date): string {
  const then = toDate(when).getTime();
  const diffMs = Math.max(0, now.getTime() - then);
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  return `${wk}w ago`;
}

function isWithinWeek(when: Date | string, now: Date): boolean {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  return now.getTime() - toDate(when).getTime() <= WEEK_MS;
}

/** The status chip from the deployment status. */
function homeStatus(deploymentStatus: string): HomeStatus {
  if (deploymentStatus === "active") return "live";
  if (deploymentStatus === "paused") return "paused";
  return "setting_up"; // draft / canceled both read as "setting up" to a buyer
}

/** Channel chips from the deployment surface. A `phone` deployment also answers
 *  SMS on the same number (the schema documents this), so it gets both chips. */
function channelsForSurface(surface: string): string[] {
  switch (surface) {
    case "phone":
      return ["Phone", "SMS"];
    case "sms":
      return ["SMS"];
    case "email":
      return ["Email"];
    case "embed":
      return ["Web chat"];
    case "link":
      return ["Hosted page"];
    default:
      return [];
  }
}

/** Map a booking status → an outcome badge. */
function bookingBadge(status: string): { label: string; tone: HomeActivityBadgeTone } {
  switch (status) {
    case "completed":
      return { label: "Completed", tone: "pos" };
    case "cancelled":
      return { label: "Cancelled", tone: "amber" };
    default:
      return { label: "Booked", tone: "pos" };
  }
}

/** Map a conversation status → an outcome badge. */
function conversationBadge(status: string): { label: string; tone: HomeActivityBadgeTone } {
  switch (status) {
    case "completed":
      return { label: "Handled", tone: "pos" };
    case "escalated":
      return { label: "Escalated", tone: "amber" };
    case "abandoned":
      return { label: "Missed", tone: "neutral" };
    default:
      return { label: "Answered", tone: "info" };
  }
}

/** The Configure cards available for this agent, derived from its real wizard
 *  steps so a card only deep-links to a step the agent actually has. */
function configureCards(view: BuyerAgentView): HomeConfigureCard[] {
  const setup = (kind: OnboardingStepKind) =>
    `${buyerSetupPath(view.deployment.id) ?? ""}?step=${kind}`;
  const cards: HomeConfigureCard[] = [];
  const kinds = new Set(view.steps.map((s) => s.kind));

  if (kinds.has("business_info")) {
    cards.push({
      kind: "business_info",
      title: "Business info",
      sub: "Name, services & hours",
      href: setup("business_info"),
    });
  }
  if (kinds.has("brand_info")) {
    cards.push({
      kind: "brand_info",
      title: "Brand",
      sub: "Voice & topics",
      href: setup("brand_info"),
    });
  }
  if (kinds.has("phone")) {
    cards.push({
      kind: "phone",
      title: "Phone",
      sub: "Your number & forwarding",
      href: setup("phone"),
    });
  }
  for (const step of view.steps) {
    if (step.kind === "connect_tool" && step.toolkit) {
      cards.push({
        kind: "connect_tool",
        title: "Calendar",
        sub: "Where bookings land",
        href: `${buyerSetupPath(view.deployment.id) ?? ""}?step=connect_tool`,
      });
      break; // one calendar card is enough for the home
    }
  }
  return cards;
}

// ─── the pure view assembler ─────────────────────────────────────────────────

export type BuildMyAgentHomeInput = {
  view: BuyerAgentView;
  conversations: HomeConversationRow[];
  bookings: HomeBookingRow[];
  /** Whether a paid marketplace purchase backs this agent (drives the billing
   *  "Manage billing" affordance). */
  hasPaidPurchase: boolean;
  /** Clock (injected so tests pin relative times + the week window). */
  now: Date;
};

/**
 * Build the serializable "My Agent" home view from already-loaded rows. Pure.
 *
 * Stats are THIS-WEEK counts (calls answered, jobs booked) computed from the
 * passed rows; the activity feed merges recent conversations + bookings into one
 * time-ordered list with outcome badges; Configure cards are derived from the
 * agent's real wizard steps; Billing reflects the deployment price + whether a
 * portal is available. Tolerant of empty/partial inputs (a brand-new agent shows
 * zeros + an empty feed, never throws).
 */
export function buildMyAgentHomeView(input: BuildMyAgentHomeInput): MyAgentHomeView {
  const d = input.view.deployment;
  const now = input.now;

  const businessName =
    d.customization?.businessInfo?.name?.trim() || d.clientName || "Your business";

  // This-week stats.
  const callsThisWeek = input.conversations.filter(
    (c) => c.status !== "test" && isWithinWeek(c.startedAt, now),
  ).length;
  const realBookings = input.bookings.filter((b) => b.status !== "template");
  const bookedThisWeek = realBookings.filter((b) => isWithinWeek(b.startsAt, now)).length;

  const weekStats: HomeStat[] = [
    { label: "Calls answered", value: String(callsThisWeek) },
    { label: "Jobs booked", value: String(bookedThisWeek) },
  ];

  // Activity feed: merge recent conversations + bookings, newest first, top 6.
  type SortedActivity = HomeActivityItem & { _sort: number };
  const convItems: SortedActivity[] = input.conversations
    .filter((c) => c.status !== "test")
    .map((c) => {
      const badge = conversationBadge(c.status);
      return {
        id: `conv-${c.id}`,
        icon: "phone",
        title: c.preview?.trim() || "Call",
        detail: "Inbound call",
        time: relativeTime(c.lastTurnAt ?? c.startedAt, now),
        badgeLabel: badge.label,
        badgeTone: badge.tone,
        _sort: toDate(c.lastTurnAt ?? c.startedAt).getTime(),
      };
    });

  const bookingItems: SortedActivity[] = realBookings.map((b) => {
    const badge = bookingBadge(b.status);
    return {
      id: `book-${b.id}`,
      icon: "calendar",
      title: b.title || "Appointment",
      detail: b.fullName?.trim() || "Customer",
      time: relativeTime(b.startsAt, now),
      badgeLabel: badge.label,
      badgeTone: badge.tone,
      _sort: toDate(b.startsAt).getTime(),
    };
  });

  const activity: HomeActivityItem[] = [...convItems, ...bookingItems]
    .sort((a, b) => b._sort - a._sort)
    .slice(0, 6)
    .map(({ _sort, ...item }) => {
      void _sort;
      return item;
    });

  // Upcoming-ish booking cards (next few, scheduled first).
  const bookings: HomeBookingCard[] = realBookings
    .filter((b) => b.status !== "cancelled")
    .sort((a, b) => toDate(b.startsAt).getTime() - toDate(a.startsAt).getTime())
    .slice(0, 2)
    .map((b) => ({
      id: b.id,
      service: b.title || "Appointment",
      customer: b.fullName?.trim() || "Customer",
      when: toDate(b.startsAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    }));

  // Billing.
  const priceCents = d.priceCents ?? 0;
  const billing: HomeBilling = {
    plan: priceCents > 0 ? "Active subscription" : "Free plan",
    price: priceCents > 0 ? `$${(priceCents / 100).toFixed(0)}/mo` : "Free",
    canManage: input.hasPaidPurchase && priceCents > 0,
  };

  return {
    name: d.clientName || businessName,
    businessName,
    status: homeStatus(d.status),
    phoneNumber: d.phoneNumber ?? null,
    channels: channelsForSurface(d.surface),
    weekStats,
    activity,
    bookings,
    configure: configureCards(input.view),
    billing,
  };
}

// ─── getBuyerAgentHome (DI'd, org-scoped) ────────────────────────────────────

export type GetBuyerAgentHomeDeps = {
  /** The org-scoped agent load (reuses getBuyerAgent). */
  loadAgent: (deploymentId: string, buyerOrgId: string) => Promise<BuyerAgentView | null>;
  /** Recent conversations for an org (the deployment's activity org). */
  listConversations: (orgId: string, limit: number) => Promise<HomeConversationRow[]>;
  /** Recent bookings for an org (the deployment's activity org). */
  listBookings: (orgId: string, limit: number) => Promise<HomeBookingRow[]>;
  /** Whether a paid marketplace purchase backs this deployment. */
  hasPaidPurchase: (buyerOrgId: string, view: BuyerAgentView) => Promise<boolean>;
  now?: () => Date;
};

/**
 * Load the buyer's "My Agent" home, ORG-SCOPED. Returns null when the deployment
 * isn't the buyer's (a 404 to anyone else). Reads activity from the deployment's
 * ACTIVITY org (`clientOrgId ?? builderOrgId`) — always the buyer's own data.
 */
export async function getBuyerAgentHome(
  deploymentId: string,
  buyerOrgId: string,
  deps: GetBuyerAgentHomeDeps,
): Promise<MyAgentHomeView | null> {
  const view = await deps.loadAgent(deploymentId, buyerOrgId);
  if (!view) return null;

  const activityOrgId = view.deployment.clientOrgId ?? view.deployment.builderOrgId;
  const [conversations, bookings, hasPaidPurchase] = await Promise.all([
    deps.listConversations(activityOrgId, 12),
    deps.listBookings(activityOrgId, 12),
    deps.hasPaidPurchase(buyerOrgId, view),
  ]);

  return buildMyAgentHomeView({
    view,
    conversations,
    bookings,
    hasPaidPurchase,
    now: deps.now ? deps.now() : new Date(),
  });
}

// ─── lazy DB-backed default deps (never imported in unit tests) ──────────────

/** Real reads for getBuyerAgentHome. Lazy `import("@/db")` so unit tests never
 *  touch Postgres. */
export function buildDefaultGetBuyerAgentHomeDeps(): GetBuyerAgentHomeDeps {
  return {
    loadAgent: async (deploymentId, buyerOrgId) => {
      const { getBuyerAgent, buildDefaultGetBuyerAgentDeps } = await import(
        "@/lib/marketplace/buyer/buyer-deployment"
      );
      return getBuyerAgent(deploymentId, buyerOrgId, buildDefaultGetBuyerAgentDeps());
    },
    listConversations: async (orgId, limit) => {
      const { db } = await import("@/db");
      const { agentConversations } = await import("@/db/schema/agents");
      const { desc, eq } = await import("drizzle-orm");
      const rows = await db
        .select({
          id: agentConversations.id,
          status: agentConversations.status,
          startedAt: agentConversations.startedAt,
          lastTurnAt: agentConversations.lastTurnAt,
        })
        .from(agentConversations)
        .where(eq(agentConversations.orgId, orgId))
        .orderBy(desc(agentConversations.lastTurnAt))
        .limit(limit);
      return rows.map((r) => ({ ...r, preview: null }));
    },
    listBookings: async (orgId, limit) => {
      const { db } = await import("@/db");
      const { bookings } = await import("@/db/schema/bookings");
      const { and, desc, eq, ne } = await import("drizzle-orm");
      const rows = await db
        .select({
          id: bookings.id,
          title: bookings.title,
          status: bookings.status,
          startsAt: bookings.startsAt,
          fullName: bookings.fullName,
        })
        .from(bookings)
        .where(and(eq(bookings.orgId, orgId), ne(bookings.status, "template")))
        .orderBy(desc(bookings.startsAt))
        .limit(limit);
      return rows;
    },
    hasPaidPurchase: async (buyerOrgId, view) => {
      try {
        const { db } = await import("@/db");
        const { marketplacePurchases } = await import("@/db/schema/marketplace-purchases");
        const { agentTemplates } = await import("@/db/schema/agent-templates");
        const { and, eq, inArray } = await import("drizzle-orm");
        // The buyer's cloned template stamps `sourceListingId`; the purchase row
        // carries the same listingId. Match through the deployment's template.
        const [tpl] = await db
          .select({ blueprint: agentTemplates.blueprint })
          .from(agentTemplates)
          .where(eq(agentTemplates.id, view.deployment.agentTemplateId))
          .limit(1);
        const listingId =
          (tpl?.blueprint as { sourceListingId?: string } | null)?.sourceListingId ?? null;
        if (!listingId) return false;
        const rows = await db
          .select({ id: marketplacePurchases.id })
          .from(marketplacePurchases)
          .where(
            and(
              eq(marketplacePurchases.buyerOrgId, buyerOrgId),
              eq(marketplacePurchases.listingId, listingId),
              inArray(marketplacePurchases.status, ["active", "past_due"]),
            ),
          )
          .limit(1);
        return rows.length > 0;
      } catch {
        return false;
      }
    },
  };
}
