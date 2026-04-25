// Workspace test-mode persistence helpers.
// SLICE 8 C2 per audit + gates G-8-1 (column flag), G-8-4 (validate
// at write boundary), G-8-7 (read at dispatch time).
//
// Storage contract:
//   - loadWorkspaceTestMode(orgId) → { enabled, twilio?, resend? }
//   - setWorkspaceTestMode(orgId, enabled) — toggle column
//   - setWorkspaceTestConfig(orgId, "twilio"|"resend", config) — upsert
//     per-provider test creds (validated against TestModeConfigSchema)
//   - clearWorkspaceTestConfig(orgId, "twilio"|"resend") — remove
//
// Pattern mirrors SLICE 7 message-trigger-storage: pure interface +
// in-memory store for tests + Drizzle adapter for production. Test
// config validation runs at the write boundary (per L-22 structural
// enforcement); the read path returns whatever's stored without
// re-validation (the writer was the gate).

import {
  TwilioTestConfigSchema,
  ResendTestConfigSchema,
  type TwilioTestConfig,
  type ResendTestConfig,
} from "./schema";

export type WorkspaceTestModeState = {
  enabled: boolean;
  twilio?: TwilioTestConfig;
  resend?: ResendTestConfig;
};

export type WorkspaceTestModeStore = {
  loadWorkspaceTestMode(orgId: string): Promise<WorkspaceTestModeState>;
  setWorkspaceTestMode(orgId: string, enabled: boolean): Promise<void>;
  setWorkspaceTestConfig(
    orgId: string,
    provider: "twilio",
    config: TwilioTestConfig,
  ): Promise<void>;
  setWorkspaceTestConfig(
    orgId: string,
    provider: "resend",
    config: ResendTestConfig,
  ): Promise<void>;
  clearWorkspaceTestConfig(
    orgId: string,
    provider: "twilio" | "resend",
  ): Promise<void>;
  /** Test-only seeding hook (underscore-prefixed to discourage prod use). */
  _seed?(orgId: string, state: Partial<WorkspaceTestModeState>): void;
};

// ---------------------------------------------------------------------
// In-memory store (tests)
// ---------------------------------------------------------------------

export type InMemoryWorkspaceTestModeStore = WorkspaceTestModeStore & {
  _seed(orgId: string, state: Partial<WorkspaceTestModeState>): void;
};

export function makeInMemoryWorkspaceTestModeStore(): InMemoryWorkspaceTestModeStore {
  const states = new Map<string, WorkspaceTestModeState>();

  function getOrInit(orgId: string): WorkspaceTestModeState {
    let state = states.get(orgId);
    if (!state) {
      state = { enabled: false };
      states.set(orgId, state);
    }
    return state;
  }

  return {
    async loadWorkspaceTestMode(orgId) {
      const state = states.get(orgId);
      if (!state) return { enabled: false };
      // Return shallow clone so callers can't mutate stored state.
      return { ...state };
    },
    async setWorkspaceTestMode(orgId, enabled) {
      const state = getOrInit(orgId);
      state.enabled = enabled;
      states.set(orgId, state);
    },
    async setWorkspaceTestConfig(orgId, provider, config) {
      const validated =
        provider === "twilio"
          ? TwilioTestConfigSchema.parse(config)
          : ResendTestConfigSchema.parse(config);
      const state = getOrInit(orgId);
      if (provider === "twilio") {
        state.twilio = validated as TwilioTestConfig;
      } else {
        state.resend = validated as ResendTestConfig;
      }
      states.set(orgId, state);
    },
    async clearWorkspaceTestConfig(orgId, provider) {
      const state = states.get(orgId);
      if (!state) return;
      if (provider === "twilio") delete state.twilio;
      else delete state.resend;
      states.set(orgId, state);
    },
    _seed(orgId, partial) {
      const existing = states.get(orgId) ?? { enabled: false };
      states.set(orgId, { ...existing, ...partial });
    },
  };
}
