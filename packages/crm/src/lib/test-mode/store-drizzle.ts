// Drizzle-backed WorkspaceTestModeStore.
// SLICE 8 C2 per audit + G-8-1 + G-8-7.
//
// Reads/writes:
//   - organizations.test_mode (boolean column) ↔ state.enabled
//   - organizations.integrations.{twilio,resend}.test ↔ state.{twilio,resend}
//
// Test config validation runs at the write boundary
// (TestModeConfigSchema parse before Drizzle update).

import { eq } from "drizzle-orm";

import type { DbClient } from "@/db";
import { organizations, type OrganizationIntegrations } from "@/db/schema/organizations";
import {
  TwilioTestConfigSchema,
  ResendTestConfigSchema,
  type ResendTestConfig,
  type TwilioTestConfig,
} from "./schema";
import type {
  WorkspaceTestModeState,
  WorkspaceTestModeStore,
} from "./store";

export class DrizzleWorkspaceTestModeStore implements WorkspaceTestModeStore {
  constructor(private readonly db: DbClient) {}

  async loadWorkspaceTestMode(orgId: string): Promise<WorkspaceTestModeState> {
    const rows = await this.db
      .select({
        testMode: organizations.testMode,
        integrations: organizations.integrations,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (rows.length === 0) return { enabled: false };
    const row = rows[0];
    return {
      enabled: row.testMode,
      twilio: row.integrations.twilio?.test,
      resend: row.integrations.resend?.test,
    };
  }

  async setWorkspaceTestMode(orgId: string, enabled: boolean): Promise<void> {
    await this.db
      .update(organizations)
      .set({ testMode: enabled, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
  }

  async setWorkspaceTestConfig(
    orgId: string,
    provider: "twilio" | "resend",
    config: TwilioTestConfig | ResendTestConfig,
  ): Promise<void> {
    const validated =
      provider === "twilio"
        ? TwilioTestConfigSchema.parse(config)
        : ResendTestConfigSchema.parse(config);

    const rows = await this.db
      .select({ integrations: organizations.integrations })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (rows.length === 0) {
      throw new Error(`organization ${orgId} not found`);
    }
    const integrations: OrganizationIntegrations = { ...rows[0].integrations };

    if (provider === "twilio") {
      integrations.twilio = {
        ...(integrations.twilio ?? {
          accountSid: "",
          authToken: "",
          fromNumber: "",
          connected: false,
        }),
        test: validated as TwilioTestConfig,
      };
    } else {
      integrations.resend = {
        ...(integrations.resend ?? {
          apiKey: "",
          fromEmail: "",
          fromName: "",
          connected: false,
        }),
        test: validated as ResendTestConfig,
      };
    }

    await this.db
      .update(organizations)
      .set({ integrations, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
  }

  async clearWorkspaceTestConfig(
    orgId: string,
    provider: "twilio" | "resend",
  ): Promise<void> {
    const rows = await this.db
      .select({ integrations: organizations.integrations })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (rows.length === 0) return;
    const integrations: OrganizationIntegrations = { ...rows[0].integrations };

    if (provider === "twilio" && integrations.twilio) {
      const { test: _drop, ...rest } = integrations.twilio;
      integrations.twilio = rest;
    } else if (provider === "resend" && integrations.resend) {
      const { test: _drop, ...rest } = integrations.resend;
      integrations.resend = rest;
    }

    await this.db
      .update(organizations)
      .set({ integrations, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
  }
}
