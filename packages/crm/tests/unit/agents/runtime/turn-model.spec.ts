// ICP-3 — TDD for the env-aware wrapper resolveTurnModel.
//
// This layer adds two env behaviors on top of the pure selector:
//   - SF_ADAPTIVE_RUNTIME_MODEL=off  → kill switch: always the default model.
//   - ANTHROPIC_RUNTIME_PREMIUM_MODEL → override the premium tier.
// Plus the same fail-soft contract: ANY error → defaultModel unchanged.

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { resolveTurnModel } from "../../../../src/lib/agents/runtime/turn-model";

const DEFAULT = "claude-sonnet-4-5-20250929";
const PREMIUM_DEFAULT = "claude-sonnet-4-6";

// Snapshot + restore the env vars this module reads, so tests don't leak state.
const ORIG_OFF = process.env.SF_ADAPTIVE_RUNTIME_MODEL;
const ORIG_PREMIUM = process.env.ANTHROPIC_RUNTIME_PREMIUM_MODEL;

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  setEnv("SF_ADAPTIVE_RUNTIME_MODEL", ORIG_OFF);
  setEnv("ANTHROPIC_RUNTIME_PREMIUM_MODEL", ORIG_PREMIUM);
});

describe("resolveTurnModel — adaptive selection (default env)", () => {
  test("a hard turn → the default premium model", () => {
    setEnv("SF_ADAPTIVE_RUNTIME_MODEL", undefined);
    setEnv("ANTHROPIC_RUNTIME_PREMIUM_MODEL", undefined);
    assert.equal(
      resolveTurnModel({ userMessage: "cancel my appointment", defaultModel: DEFAULT }),
      PREMIUM_DEFAULT,
    );
  });

  test("an easy turn → the default model", () => {
    setEnv("SF_ADAPTIVE_RUNTIME_MODEL", undefined);
    assert.equal(
      resolveTurnModel({ userMessage: "what are your hours?", defaultModel: DEFAULT }),
      DEFAULT,
    );
  });
});

describe("resolveTurnModel — SF_ADAPTIVE_RUNTIME_MODEL=off kill switch", () => {
  test("off forces the default model even on a hard turn", () => {
    setEnv("SF_ADAPTIVE_RUNTIME_MODEL", "off");
    assert.equal(
      resolveTurnModel({
        userMessage: "I need to book and also talk to a human urgently",
        toolNamesAvailable: ["book_appointment", "escalate_to_human"],
        priorToolError: true,
        defaultModel: DEFAULT,
      }),
      DEFAULT,
    );
  });

  test("off is case-insensitive / whitespace-tolerant", () => {
    setEnv("SF_ADAPTIVE_RUNTIME_MODEL", "  OFF  ");
    assert.equal(
      resolveTurnModel({ userMessage: "book an appointment", defaultModel: DEFAULT }),
      DEFAULT,
    );
  });

  test("any other value does NOT disable (adaptive still runs)", () => {
    setEnv("SF_ADAPTIVE_RUNTIME_MODEL", "on");
    assert.equal(
      resolveTurnModel({ userMessage: "book an appointment", defaultModel: DEFAULT }),
      PREMIUM_DEFAULT,
    );
  });
});

describe("resolveTurnModel — ANTHROPIC_RUNTIME_PREMIUM_MODEL override", () => {
  test("hard turn uses the env-configured premium model", () => {
    setEnv("SF_ADAPTIVE_RUNTIME_MODEL", undefined);
    setEnv("ANTHROPIC_RUNTIME_PREMIUM_MODEL", "claude-opus-4-8");
    assert.equal(
      resolveTurnModel({ userMessage: "give me a quote", defaultModel: DEFAULT }),
      "claude-opus-4-8",
    );
  });

  test("the override does not affect easy turns (still default)", () => {
    setEnv("ANTHROPIC_RUNTIME_PREMIUM_MODEL", "claude-opus-4-8");
    assert.equal(
      resolveTurnModel({ userMessage: "thanks!", defaultModel: DEFAULT }),
      DEFAULT,
    );
  });
});
