// Per-provider test-mode resolvers.
// SLICE 8 C3 per audit §4.1 + gates G-8-4 (fail-fast) + G-8-7 (read at dispatch).
//
// Two independent resolvers — orthogonal by design (no policy interleaving):
//   - resolveTwilioConfig(opts) → live or test TwilioRuntimeConfig
//   - resolveResendConfig(opts) → live or test ResendRuntimeConfig
//
// Per L-17 hypothesis (2-datapoint dispatcher interleaving from SLICE 7):
//   - Interleaved policies: 3.0-4.0x test/prod
//   - Orthogonal policies:  1.5-2.0x
// SLICE 8 ships orthogonal resolvers as the 3rd datapoint candidate.
// Each resolver consults `org.testMode` independently and returns the
// appropriate config — zero policy interaction between providers.
//
// Per G-8-7 ("read at dispatch, not at run start"): resolvers are invoked
// at the send-function boundary (sendSmsFromApi, sendEmailFromApi), NOT
// threaded through the workflow runtime. Toggling test mode mid-run
// affects subsequent dispatches; in-flight sends complete on whichever
// mode they started under (acceptable race window per audit §11 risk
// register).

import type { WorkspaceTestModeStore } from "./store";

export type TwilioRuntimeConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export type ResendRuntimeConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

export type TwilioRuntimeConfigWithMode = TwilioRuntimeConfig & {
  mode: "live" | "test";
};

export type ResendRuntimeConfigWithMode = ResendRuntimeConfig & {
  mode: "live" | "test";
};

export class TestModeMissingConfigError extends Error {
  readonly provider: "twilio" | "resend";
  constructor(provider: "twilio" | "resend") {
    super(
      `Test mode active but no test credentials configured for ${provider}. ` +
        `Configure test credentials in workspace settings, or disable test mode.`,
    );
    this.name = "TestModeMissingConfigError";
    this.provider = provider;
  }
}

export type ResolveTwilioInput = {
  orgId: string;
  liveConfig: TwilioRuntimeConfig;
  store: WorkspaceTestModeStore;
};

export async function resolveTwilioConfig(
  input: ResolveTwilioInput,
): Promise<TwilioRuntimeConfigWithMode> {
  const state = await input.store.loadWorkspaceTestMode(input.orgId);
  if (!state.enabled) {
    return { ...input.liveConfig, mode: "live" };
  }
  if (!state.twilio) {
    throw new TestModeMissingConfigError("twilio");
  }
  return {
    accountSid: state.twilio.accountSid,
    authToken: state.twilio.authToken,
    fromNumber: state.twilio.fromNumber,
    mode: "test",
  };
}

export type ResolveResendInput = {
  orgId: string;
  liveConfig: ResendRuntimeConfig;
  store: WorkspaceTestModeStore;
};

export async function resolveResendConfig(
  input: ResolveResendInput,
): Promise<ResendRuntimeConfigWithMode> {
  const state = await input.store.loadWorkspaceTestMode(input.orgId);
  if (!state.enabled) {
    return { ...input.liveConfig, mode: "live" };
  }
  if (!state.resend) {
    throw new TestModeMissingConfigError("resend");
  }
  // Test config doesn't carry fromName — inherit from live config so
  // outbound emails still render the workspace's brand.
  return {
    apiKey: state.resend.apiKey,
    fromEmail: state.resend.fromEmail,
    fromName: input.liveConfig.fromName,
    mode: "test",
  };
}
