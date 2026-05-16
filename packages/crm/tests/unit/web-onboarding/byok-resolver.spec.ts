// packages/crm/tests/unit/web-onboarding/byok-resolver.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveByokKeyFromIntegrationsBlob } from "../../../src/lib/web-onboarding/byok-resolver";

describe("resolveByokKeyFromIntegrationsBlob", () => {
  test("returns the plaintext key when integrations.anthropic.apiKey is plaintext", () => {
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "sk-ant-plain" } });
    assert.equal(result.key, "sk-ant-plain");
    assert.equal(result.source, "byok");
  });

  test("returns null when integrations is null or undefined", () => {
    assert.deepEqual(resolveByokKeyFromIntegrationsBlob(null), { key: null, source: "missing" });
    assert.deepEqual(resolveByokKeyFromIntegrationsBlob(undefined), { key: null, source: "missing" });
  });

  test("returns null when anthropic.apiKey is an empty string", () => {
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "" } });
    assert.equal(result.key, null);
    assert.equal(result.source, "missing");
  });

  test("returns null when the encrypted payload cannot be decrypted", () => {
    // "v1." prefix signals encrypted payload; mangled body will fail decrypt and
    // the resolver swallows the error.
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "v1.broken.payload.here" } });
    assert.equal(result.key, null);
    assert.equal(result.source, "undecryptable");
  });
});
