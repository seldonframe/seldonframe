// TDD for the deployment AI-key runtime resolver (DI'd wiring; no DB).
//
// resolveDeploymentRuntimeKey reads the deployment's TEMPLATE owner org (the
// builder), reads that org's BYOK keys, and runs the pure resolver. This covers
// the wiring: the template-owner chain, fail-soft to platform, and the
// never-throws degrade on a deps error.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveDeploymentRuntimeKey,
  type ResolveDeploymentRuntimeKeyDeps,
} from "../../../../src/lib/agents/deployment-ai-key-runtime";

function deps(over: Partial<ResolveDeploymentRuntimeKeyDeps> = {}): ResolveDeploymentRuntimeKeyDeps {
  return {
    getTemplateOwnerOrgId: async () => "builder-org",
    getOrgProviderKeys: async () => ({ openai: "", anthropic: "" }),
    platform: { openai: "sk-platform-oai", anthropic: "sk-platform-ant" },
    ...over,
  };
}

test("voice deployment: routes to the TEMPLATE owner org's OpenAI key", async () => {
  const seen: string[] = [];
  const r = await resolveDeploymentRuntimeKey(
    { surface: "phone", agentTemplateId: "tmpl-1" },
    deps({
      getTemplateOwnerOrgId: async (id) => {
        seen.push(id);
        return "builder-org";
      },
      getOrgProviderKeys: async (orgId) => {
        seen.push(`keys:${orgId}`);
        return { openai: "sk-builder-oai", anthropic: "" };
      },
    }),
  );
  assert.deepEqual(seen, ["tmpl-1", "keys:builder-org"]);
  assert.equal(r.provider, "openai");
  assert.equal(r.apiKey, "sk-builder-oai");
  assert.equal(r.source, "builder");
  assert.equal(r.ready, true);
});

test("voice deployment: fails soft to the platform OpenAI key when the builder set none", async () => {
  const r = await resolveDeploymentRuntimeKey(
    { surface: "phone", agentTemplateId: "tmpl-1" },
    deps({ getOrgProviderKeys: async () => ({ openai: "", anthropic: "" }) }),
  );
  assert.equal(r.apiKey, "sk-platform-oai");
  assert.equal(r.source, "platform");
});

test("chat deployment: routes to the builder's Anthropic key", async () => {
  const r = await resolveDeploymentRuntimeKey(
    { surface: "embed", agentTemplateId: "tmpl-1" },
    deps({ getOrgProviderKeys: async () => ({ openai: "", anthropic: "sk-builder-ant" }) }),
  );
  assert.equal(r.provider, "anthropic");
  assert.equal(r.apiKey, "sk-builder-ant");
  assert.equal(r.source, "builder");
});

test("not ready: a voice deployment with no builder key AND no platform key", async () => {
  const r = await resolveDeploymentRuntimeKey(
    { surface: "phone", agentTemplateId: "tmpl-1" },
    deps({ platform: { openai: null, anthropic: null } }),
  );
  assert.equal(r.ready, false);
  assert.equal(r.apiKey, null);
  assert.equal(r.source, "none");
});

test("degrades to the platform key (never throws) when the template lookup errors", async () => {
  const r = await resolveDeploymentRuntimeKey(
    { surface: "phone", agentTemplateId: "tmpl-1" },
    deps({
      getTemplateOwnerOrgId: async () => {
        throw new Error("db down");
      },
    }),
  );
  assert.equal(r.apiKey, "sk-platform-oai");
  assert.equal(r.source, "platform");
});

test("missing template owner (null) → platform key", async () => {
  const r = await resolveDeploymentRuntimeKey(
    { surface: "phone", agentTemplateId: "tmpl-gone" },
    deps({ getTemplateOwnerOrgId: async () => null }),
  );
  assert.equal(r.source, "platform");
  assert.equal(r.apiKey, "sk-platform-oai");
});
