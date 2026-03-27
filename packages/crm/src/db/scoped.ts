import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  apiKeys,
  contacts,
  deals,
  intakeForms,
  intakeSubmissions,
  organizations,
  pipelines,
  users,
  webhookEndpoints,
} from "@/db/schema";

export function scopedQuery(orgId: string) {
  return {
    organization: () => db.query.organizations.findFirst({ where: eq(organizations.id, orgId) }),
    users: () => db.select().from(users).where(eq(users.orgId, orgId)),
    contacts: () => db.select().from(contacts).where(eq(contacts.orgId, orgId)),
    deals: () => db.select().from(deals).where(eq(deals.orgId, orgId)),
    activities: () => db.select().from(activities).where(eq(activities.orgId, orgId)),
    pipelines: () => db.select().from(pipelines).where(eq(pipelines.orgId, orgId)),
    intakeForms: () => db.select().from(intakeForms).where(eq(intakeForms.orgId, orgId)),
    intakeSubmissions: () => db.select().from(intakeSubmissions).where(eq(intakeSubmissions.orgId, orgId)),
    webhookEndpoints: () => db.select().from(webhookEndpoints).where(eq(webhookEndpoints.orgId, orgId)),
    apiKeys: () => db.select().from(apiKeys).where(eq(apiKeys.orgId, orgId)),
  };
}
