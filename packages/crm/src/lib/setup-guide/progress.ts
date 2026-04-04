"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts, deals, intakeForms, landingPages, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";

export type SetupTask = {
  id: string;
  label: string;
  description: string;
  href: string;
  completed: boolean;
};

export type SetupGuideProgress = {
  tasks: SetupTask[];
  completedCount: number;
  totalCount: number;
  dismissed: boolean;
  allDone: boolean;
};

export async function getSetupGuideProgress(): Promise<SetupGuideProgress | null> {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const [org] = await db
    .select({
      settings: organizations.settings,
      soulId: organizations.soulId,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return null;
  }

  const setupComplete = Boolean(org.soulId);

  if (!setupComplete) {
    return null;
  }

  const dismissed = Boolean(
    (org.settings as Record<string, unknown>)?.setupGuideDismissedAt,
  );

  const [contactCount, dealCount, bookingTemplateCount, intakeFormCount, landingPageCount] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
        .then((rows) => rows[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .where(eq(deals.orgId, orgId))
        .then((rows) => rows[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookings)
        .where(eq(bookings.orgId, orgId))
        .then((rows) => rows[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(intakeForms)
        .where(eq(intakeForms.orgId, orgId))
        .then((rows) => rows[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(landingPages)
        .where(eq(landingPages.orgId, orgId))
        .then((rows) => rows[0]?.count ?? 0),
    ]);

  const tasks: SetupTask[] = [
    {
      id: "complete-setup",
      label: "Complete setup wizard",
      description: "Your core business system is configured and live.",
      href: "/dashboard",
      completed: setupComplete,
    },
    {
      id: "add-contact",
      label: "Add your first contact",
      description: "Import or create a contact to start building your CRM.",
      href: "/contacts",
      completed: contactCount > 0,
    },
    {
      id: "create-deal",
      label: "Create your first engagement",
      description: "Track a deal or project through your pipeline.",
      href: "/deals",
      completed: dealCount > 0,
    },
    {
      id: "customize-booking",
      label: "Customize your booking page",
      description: "Set your availability and share your booking link.",
      href: "/bookings",
      completed: bookingTemplateCount > 0,
    },
    {
      id: "review-landing",
      label: "Review your landing page",
      description: "Preview and customize your public-facing page.",
      href: "/landing",
      completed: landingPageCount > 0,
    },
    {
      id: "share-form",
      label: "Share your intake form",
      description: "Send your intake form to collect leads.",
      href: "/forms",
      completed: intakeFormCount > 0,
    },
  ];

  const completedCount = tasks.filter((task) => task.completed).length;

  return {
    tasks,
    completedCount,
    totalCount: tasks.length,
    dismissed,
    allDone: completedCount === tasks.length,
  };
}

export async function dismissSetupGuide() {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    return;
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return;
  }

  const nextSettings = {
    ...(org.settings ?? {}),
    setupGuideDismissedAt: new Date().toISOString(),
  };

  await db
    .update(organizations)
    .set({ settings: nextSettings, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}
