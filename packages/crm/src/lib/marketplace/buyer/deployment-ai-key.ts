// Marketplace buyer onboarding — the deployment AI-key RESOLVER (pure).
//
// A marketplace BUYER's deployment runs the BUILDER's (template author's) agent.
// Who pays for the LLM? The BUILDER — they set their key in Studio. So a bought
// agent must resolve the builder/template org's key FIRST, and fail-soft to the
// SeldonFrame platform key only as a backstop. This is the single pure decision:
//
//   • the agent's surface picks the PROVIDER — a `phone` (voice) deployment runs
//     on OpenAI Realtime; every text surface (embed / link / sms / email) runs on
//     the Anthropic agent loop,
//   • precedence is builder-key → platform-key → none,
//   • `ready` is false ONLY when NEITHER a builder nor a platform key exists for
//     the needed provider — the signal the caller uses to fail-soft (voice: keep
//     the platform path / a graceful message; chat: the "isn't ready yet" reply)
//     instead of crashing, and to flag the builder.
//
// Pure: no DB, no env reads, no decryption — the caller resolves the raw key
// strings (builder org integrations + platform env) and hands them in. Nothing
// throws; a blank/whitespace key is treated as absent.

/** The deployment surface vocabulary (mirrors DeploymentSurface). */
export type DeploymentAiSurface = "phone" | "embed" | "link" | "sms" | "email";

/** Which LLM provider a surface runs on. */
export type DeploymentAiProvider = "openai" | "anthropic";

/** Where the resolved key came from. */
export type DeploymentAiKeySource = "builder" | "platform" | "none";

export type ResolveDeploymentAiKeyInput = {
  /** The deployment surface — picks the provider. */
  surface: DeploymentAiSurface;
  /** The BUILDER (template author) org's OpenAI key, if set (already decrypted). */
  builderOpenAiKey?: string | null;
  /** The BUILDER org's Anthropic key, if set (already decrypted). */
  builderAnthropicKey?: string | null;
  /** The SeldonFrame platform OpenAI key (process.env.OPENAI_API_KEY). */
  platformOpenAiKey?: string | null;
  /** The SeldonFrame platform Anthropic key (process.env.ANTHROPIC_API_KEY). */
  platformAnthropicKey?: string | null;
};

export type ResolveDeploymentAiKeyResult = {
  /** Which provider this surface needs. */
  provider: DeploymentAiProvider;
  /** The resolved key, or null when neither a builder nor a platform key exists. */
  key: string | null;
  /** Where the key came from. 'none' ⇒ the agent isn't ready (no key anywhere). */
  source: DeploymentAiKeySource;
  /** Convenience: a usable key resolved (source !== 'none'). */
  ready: boolean;
};

/** A `phone` deployment is voice (OpenAI Realtime); everything else is text
 *  (the Anthropic agent loop). One place so the provider mapping is consistent. */
export function providerForSurface(surface: DeploymentAiSurface): DeploymentAiProvider {
  return surface === "phone" ? "openai" : "anthropic";
}

/** Trim + treat blank as absent. */
function firstUsable(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string") {
      const t = c.trim();
      if (t) return t;
    }
  }
  return null;
}

/**
 * Resolve the AI key a deployment's runtime should use: the BUILDER's key for the
 * needed provider first, the platform key as a fail-soft backstop, else none
 * (`ready: false`). Pure.
 */
export function resolveDeploymentAiKey(
  input: ResolveDeploymentAiKeyInput,
): ResolveDeploymentAiKeyResult {
  const provider = providerForSurface(input.surface);

  const builderKey =
    provider === "openai" ? input.builderOpenAiKey : input.builderAnthropicKey;
  const platformKey =
    provider === "openai" ? input.platformOpenAiKey : input.platformAnthropicKey;

  const fromBuilder = firstUsable(builderKey);
  if (fromBuilder) {
    return { provider, key: fromBuilder, source: "builder", ready: true };
  }
  const fromPlatform = firstUsable(platformKey);
  if (fromPlatform) {
    return { provider, key: fromPlatform, source: "platform", ready: true };
  }
  return { provider, key: null, source: "none", ready: false };
}
