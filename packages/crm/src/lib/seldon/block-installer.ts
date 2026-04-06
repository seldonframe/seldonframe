"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  intakeForms,
  landingPages,
  organizations,
  type OrganizationIntegrations,
} from "@/db/schema";
import { createFormAction, updateFormAction } from "@/lib/forms/actions";
import { createEmailTemplateForSeldonAction, updateEmailTemplateAction } from "@/lib/emails/actions";
import { createBookingTypeForSeldonAction, updateBookingTypeAction } from "@/lib/bookings/actions";
import { createLandingPageForSeldonAction, updateLandingPageAction } from "@/lib/landing/actions";
import type { OrgSoul } from "@/lib/soul/types";
import type { OrgTheme } from "@/lib/theme/types";

export type SeldonBlockType = "form" | "email" | "booking" | "page" | "automation";

export type IntegrationStatus = OrganizationIntegrations;

type AutomationRecord = {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  updatedAt: string;
};

export interface InstallResult {
  entityId: string;
  type: SeldonBlockType;
  name: string;
  description: string;
  publicUrl: string | null;
  adminUrl: string;
  status: "live" | "draft" | "needs-integration";
  integrationNote?: string;
}

export interface UpdateResult {
  entityId: string;
  type: SeldonBlockType;
  name: string;
  description: string;
  publicUrl: string | null;
  adminUrl: string;
  status: "live" | "draft" | "needs-integration";
  changes: string;
}

async function readOrgSettings(orgId: string) {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return ((org?.settings ?? {}) as Record<string, unknown>) || {};
}

async function writeOrgSettings(orgId: string, settings: Record<string, unknown>) {
  await db
    .update(organizations)
    .set({
      settings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export async function installBlock(
  orgId: string,
  orgSlug: string,
  blockType: string,
  params: Record<string, unknown>,
  _soul: OrgSoul,
  _theme: OrgTheme,
  integrations: IntegrationStatus
): Promise<InstallResult> {
  switch (blockType) {
    case "form": {
      const payload = new FormData();
      payload.set("name", String(params.name ?? "New Intake Form"));
      payload.set("slug", String(params.slug ?? params.name ?? "intake-form"));
      payload.set("fields", JSON.stringify(Array.isArray(params.fields) ? params.fields : []));

      const created = await createFormAction(payload);
      if (!created.id) {
        throw new Error("Form creation failed");
      }

      const [form] = await db
        .select({ id: intakeForms.id, name: intakeForms.name, slug: intakeForms.slug })
        .from(intakeForms)
        .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, created.id)))
        .limit(1);

      if (!form) {
        throw new Error("Form not found after creation");
      }

      return {
        entityId: form.id,
        type: "form",
        name: form.name,
        description: String(params.description ?? "Intake form created"),
        publicUrl: `/forms/${orgSlug}/${form.slug}`,
        adminUrl: "/forms",
        status: "live",
      };
    }

    case "email": {
      const created = await createEmailTemplateForSeldonAction({
        name: String(params.name ?? "Welcome Email"),
        subject: String(params.subject ?? "Welcome"),
        body: String(params.body ?? "Thanks for reaching out."),
        tag: typeof params.tag === "string" ? params.tag : "general",
        triggerEvent: typeof params.triggerEvent === "string" ? params.triggerEvent : undefined,
      });
      if (!created.id) {
        throw new Error("Email template creation failed");
      }

      const resendConnected = Boolean(integrations.resend?.connected);

      return {
        entityId: created.id,
        type: "email",
        name: String(params.name ?? "Welcome Email"),
        description: String(params.description ?? "Email template created"),
        publicUrl: null,
        adminUrl: "/emails",
        status: resendConnected ? "live" : "needs-integration",
        integrationNote: resendConnected ? undefined : "Connect Resend to send this template",
      };
    }

    case "booking": {
      const created = await createBookingTypeForSeldonAction({
        name: String(params.name ?? "Consultation"),
        slug: String(params.slug ?? params.name ?? "consultation"),
        durationMinutes: Number(params.durationMinutes ?? 30),
        description: String(params.description ?? ""),
        price: Number(params.price ?? 0),
      });
      if (!created.id) {
        throw new Error("Booking type creation failed");
      }

      return {
        entityId: created.id,
        type: "booking",
        name: created.name,
        description: String(params.description ?? "Booking type created"),
        publicUrl: `/book/${orgSlug}/${created.bookingSlug}`,
        adminUrl: "/bookings",
        status: "live",
      };
    }

    case "page": {
      const created = await createLandingPageForSeldonAction({
        title: String(params.title ?? params.name ?? "Landing Page"),
        slug: String(params.slug ?? params.title ?? params.name ?? "landing-page"),
        mode: typeof params.mode === "string" ? params.mode : "soul-template",
        template: typeof params.template === "string" ? params.template : "lead-capture",
        published: true,
      });
      if (!created.id) {
        throw new Error("Landing page creation failed");
      }

      return {
        entityId: created.id,
        type: "page",
        name: created.title,
        description: String(params.description ?? "Landing page created"),
        publicUrl: `/l/${orgSlug}/${created.slug}`,
        adminUrl: "/landing",
        status: created.status === "published" ? "live" : "draft",
      };
    }

    case "automation": {
      const settings = await readOrgSettings(orgId);
      const current = Array.isArray(settings.seldonAutomations)
        ? (settings.seldonAutomations as AutomationRecord[])
        : [];

      const id = `automation_${Date.now().toString(36)}`;
      const name = String(params.name ?? "Automation").trim() || "Automation";
      const description = String(params.description ?? "Automation flow created");

      const next: AutomationRecord = {
        id,
        name,
        description,
        config: (params.config as Record<string, unknown>) || params,
        updatedAt: new Date().toISOString(),
      };

      await writeOrgSettings(orgId, {
        ...settings,
        seldonAutomations: [...current, next],
      });

      return {
        entityId: id,
        type: "automation",
        name,
        description,
        publicUrl: null,
        adminUrl: "/automations",
        status: "live",
      };
    }

    default:
      throw new Error(`Unknown block type: ${blockType}`);
  }
}

export async function updateBlock(
  orgId: string,
  orgSlug: string,
  entityId: string,
  blockType: string,
  updates: Record<string, unknown>,
  _soul: OrgSoul,
  _theme: OrgTheme,
  integrations: IntegrationStatus
): Promise<UpdateResult> {
  switch (blockType) {
    case "form": {
      const [existing] = await db
        .select({ id: intakeForms.id, name: intakeForms.name, slug: intakeForms.slug, fields: intakeForms.fields })
        .from(intakeForms)
        .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, entityId)))
        .limit(1);

      if (!existing) {
        throw new Error("Form not found");
      }

      const payload = new FormData();
      payload.set("formId", entityId);
      payload.set("name", String(updates.name ?? existing.name));
      payload.set("slug", String(updates.slug ?? existing.slug));
      payload.set("fields", JSON.stringify(Array.isArray(updates.fields) ? updates.fields : existing.fields));

      await updateFormAction(payload);

      const [updated] = await db
        .select({ id: intakeForms.id, name: intakeForms.name, slug: intakeForms.slug })
        .from(intakeForms)
        .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, entityId)))
        .limit(1);

      if (!updated) {
        throw new Error("Updated form not found");
      }

      const changes = String(updates.changeDescription ?? "Form updated");
      return {
        entityId: updated.id,
        type: "form",
        name: updated.name,
        description: `Updated: ${changes}`,
        publicUrl: `/forms/${orgSlug}/${updated.slug}`,
        adminUrl: "/forms",
        status: "live",
        changes,
      };
    }

    case "email": {
      const updated = await updateEmailTemplateAction({
        templateId: entityId,
        name: String(updates.name ?? "Email Template"),
        subject: String(updates.subject ?? ""),
        body: String(updates.body ?? ""),
        tag: typeof updates.tag === "string" ? updates.tag : undefined,
        triggerEvent: typeof updates.triggerEvent === "string" ? updates.triggerEvent : undefined,
      });

      const resendConnected = Boolean(integrations.resend?.connected);
      const changes = String(updates.changeDescription ?? "Email updated");

      return {
        entityId: updated.id,
        type: "email",
        name: updated.name,
        description: `Updated: ${changes}`,
        publicUrl: null,
        adminUrl: "/emails",
        status: resendConnected ? "live" : "needs-integration",
        changes,
      };
    }

    case "booking": {
      const updated = await updateBookingTypeAction({
        bookingId: entityId,
        name: String(updates.name ?? "Consultation"),
        slug: String(updates.slug ?? updates.name ?? "consultation"),
        durationMinutes: Number(updates.durationMinutes ?? 30),
        description: typeof updates.description === "string" ? updates.description : "",
        price: Number(updates.price ?? 0),
        availability: (updates.availability as never) || undefined,
        bufferBeforeMinutes: Number(updates.bufferBeforeMinutes ?? 0),
        bufferAfterMinutes: Number(updates.bufferAfterMinutes ?? 0),
        maxBookingsPerDay: Number(updates.maxBookingsPerDay ?? 0),
      });

      const changes = String(updates.changeDescription ?? "Booking updated");
      return {
        entityId: updated.id,
        type: "booking",
        name: updated.name,
        description: `Updated: ${changes}`,
        publicUrl: `/book/${orgSlug}/${updated.bookingSlug}`,
        adminUrl: "/bookings",
        status: "live",
        changes,
      };
    }

    case "page": {
      const [existing] = await db
        .select({
          id: landingPages.id,
          title: landingPages.title,
          slug: landingPages.slug,
          contentHtml: landingPages.contentHtml,
          contentCss: landingPages.contentCss,
          sections: landingPages.sections,
        })
        .from(landingPages)
        .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, entityId)))
        .limit(1);

      if (!existing) {
        throw new Error("Landing page not found");
      }

      const updated = await updateLandingPageAction({
        pageId: entityId,
        title: String(updates.title ?? existing.title),
        slug: String(updates.slug ?? existing.slug),
        contentHtml: String(updates.contentHtml ?? existing.contentHtml ?? ""),
        contentCss: String(updates.contentCss ?? existing.contentCss ?? ""),
        sections: Array.isArray(updates.sections)
          ? (updates.sections as Record<string, unknown>[])
          : (existing.sections as Record<string, unknown>[]),
        seoDescription: typeof updates.seoDescription === "string" ? updates.seoDescription : undefined,
      });

      const changes = String(updates.changeDescription ?? "Page updated");
      return {
        entityId: updated.id,
        type: "page",
        name: updated.title,
        description: `Updated: ${changes}`,
        publicUrl: `/l/${orgSlug}/${updated.slug}`,
        adminUrl: "/landing",
        status: "live",
        changes,
      };
    }

    case "automation": {
      const settings = await readOrgSettings(orgId);
      const current = Array.isArray(settings.seldonAutomations)
        ? (settings.seldonAutomations as AutomationRecord[])
        : [];

      const target = current.find((item) => item.id === entityId);
      if (!target) {
        throw new Error("Automation not found");
      }

      const name = String(updates.name ?? target.name).trim() || target.name;
      const description = String(updates.description ?? target.description);
      const config = (updates.config as Record<string, unknown>) || target.config;

      const next = current.map((item) => {
        if (item.id !== entityId) {
          return item;
        }

        return {
          ...item,
          name,
          description,
          config,
          updatedAt: new Date().toISOString(),
        };
      });

      await writeOrgSettings(orgId, {
        ...settings,
        seldonAutomations: next,
      });

      const changes = String(updates.changeDescription ?? "Automation updated");
      return {
        entityId,
        type: "automation",
        name,
        description: `Updated: ${changes}`,
        publicUrl: null,
        adminUrl: "/automations",
        status: "live",
        changes,
      };
    }

    default:
      throw new Error(`Unknown block type for update: ${blockType}`);
  }
}
