// Tests for the write_state dispatcher + Zod schema + static
// allowlist. SLICE 3 C2 per audit §3.2 + G-3-3 (Option B-2, static
// allowlist config, empty v1).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  AgentSpecSchema,
  validateAgentSpec,
  type AgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../../src/lib/agents/validator";
import { dispatchWriteState } from "../../../src/lib/workflow/step-dispatchers/write-state";
import { InMemorySoulStore } from "../../../src/lib/workflow/state-access/soul-store-memory";
import type { RuntimeContext, StoredRun } from "../../../src/lib/workflow/types";
import { notImplementedToolInvoker } from "../../../src/lib/workflow/types";
import { InMemoryRuntimeStorage } from "./storage-memory";
import {
  AGENT_WRITABLE_SOUL_PATHS,
  isAgentWritablePath,
  _overrideAllowlistForTests,
} from "../../../src/lib/workflow/state-access/allowlist";

function makeContext(soulStore: InMemorySoulStore): RuntimeContext {
  return {
    storage: new InMemoryRuntimeStorage(),
    invokeTool: notImplementedToolInvoker,
    now: () => new Date("2026-04-23T12:00:00Z"),
    soulStore,
  };
}

function makeRun(overrides: Partial<StoredRun> = {}): StoredRun {
  return {
    id: "run-1",
    orgId: "org-1",
    archetypeId: "test",
    specSnapshot: {} as AgentSpec,
    triggerEventId: null,
    triggerPayload: {},
    status: "running",
    currentStepId: "w1",
    captureScope: {},
    variableScope: {},
    failureCount: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("AGENT_WRITABLE_SOUL_PATHS — narrow per-archetype allowlist", () => {
  test("allowlist is small + every entry is justified by an archetype", () => {
    // SLICE 7 PR 2 C5 added the appointment-confirm-sms entry.
    // Each addition must document which archetype + what guarantees
    // (idempotency, monotonicity, scope) per the allowlist.ts header.
    assert.ok(AGENT_WRITABLE_SOUL_PATHS.size >= 1);
    assert.ok(AGENT_WRITABLE_SOUL_PATHS.size <= 10, "allowlist creep guard");
  });

  test("isAgentWritablePath refuses arbitrary paths not in allowlist", () => {
    assert.equal(isAgentWritablePath("workspace.soul.anything"), false);
    assert.equal(isAgentWritablePath("workspace.theme.color"), false);
  });

  test("isAgentWritablePath accepts explicit allowlist entries (test-override)", () => {
    _overrideAllowlistForTests(new Set(["workspace.soul.onboardingStage"]));
    try {
      assert.equal(isAgentWritablePath("workspace.soul.onboardingStage"), true);
      assert.equal(isAgentWritablePath("workspace.soul.anythingElse"), false);
    } finally {
      _overrideAllowlistForTests(null);
    }
  });
});

describe("write_state Zod schema", () => {
  test("accepts valid write_state step", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "w1",
          type: "write_state",
          path: "workspace.soul.onboardingStage",
          value: "qualified",
          next: null,
        },
      ],
    };
    assert.ok(AgentSpecSchema.safeParse(spec).success);
  });

  test("validator flags non-allowlisted paths as spec_malformed (G-3-3)", () => {
    _overrideAllowlistForTests(new Set()); // empty — every path rejected
    try {
      const issues = validateAgentSpec(
        {
          name: "x",
          description: "x",
          trigger: { type: "event", event: "contact.created" },
          steps: [
            {
              id: "w1",
              type: "write_state",
              path: "workspace.soul.anything",
              value: "v",
              next: null,
            },
          ],
        },
        emptyBlockRegistry(),
        emptyEventRegistry("contact.created"),
      );
      assert.ok(
        issues.some(
          (i) => i.code === "spec_malformed" && /agent.writable|allowlist/i.test(i.message),
        ),
        "non-allowlisted path must produce spec_malformed with agent-writable language",
      );
    } finally {
      _overrideAllowlistForTests(null);
    }
  });

  test("validator flags non-workspace paths as spec_malformed", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "w1",
            type: "write_state",
            path: "randomField",
            value: "v",
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      emptyEventRegistry("contact.created"),
    );
    assert.ok(
      issues.some((i) => i.code === "spec_malformed" && i.path === "path"),
      "non-workspace path fails at path field",
    );
  });
});

describe("dispatchWriteState — happy path", () => {
  test("writes a Soul value at an allowlisted path", async () => {
    _overrideAllowlistForTests(new Set(["workspace.soul.stage"]));
    try {
      const soulStore = new InMemorySoulStore();
      const context = makeContext(soulStore);
      const run = makeRun();

      const result = await dispatchWriteState(
        run,
        {
          id: "w1",
          type: "write_state",
          path: "workspace.soul.stage",
          value: "qualified",
          next: "next_step",
        },
        context,
      );

      assert.equal(result.kind, "advance");
      if (result.kind !== "advance") return;
      assert.equal(result.next, "next_step");

      const written = await soulStore.readPath("org-1", "stage");
      assert.equal(written, "qualified");
    } finally {
      _overrideAllowlistForTests(null);
    }
  });

  test("resolves {{capture.x}} in value before writing", async () => {
    _overrideAllowlistForTests(new Set(["workspace.soul.couponCode"]));
    try {
      const soulStore = new InMemorySoulStore();
      const context = makeContext(soulStore);
      const run = makeRun({ captureScope: { coupon: { code: "SAVE20" } } });

      const result = await dispatchWriteState(
        run,
        {
          id: "w1",
          type: "write_state",
          path: "workspace.soul.couponCode",
          value: "{{coupon.code}}",
          next: null,
        },
        context,
      );
      assert.equal(result.kind, "advance");
      assert.equal(await soulStore.readPath("org-1", "couponCode"), "SAVE20");
    } finally {
      _overrideAllowlistForTests(null);
    }
  });

  test("writes nested object values", async () => {
    _overrideAllowlistForTests(new Set(["workspace.soul.preferences"]));
    try {
      const soulStore = new InMemorySoulStore();
      const context = makeContext(soulStore);
      const run = makeRun();

      const result = await dispatchWriteState(
        run,
        {
          id: "w1",
          type: "write_state",
          path: "workspace.soul.preferences",
          value: { theme: "dark", lang: "en" },
          next: null,
        },
        context,
      );
      assert.equal(result.kind, "advance");
      assert.deepEqual(await soulStore.readPath("org-1", "preferences"), {
        theme: "dark",
        lang: "en",
      });
    } finally {
      _overrideAllowlistForTests(null);
    }
  });
});

describe("dispatchWriteState — defense-in-depth (runtime allowlist check)", () => {
  test("runtime refuses non-allowlisted path even if validator was bypassed", async () => {
    _overrideAllowlistForTests(new Set()); // truly empty
    try {
      const soulStore = new InMemorySoulStore();
      const context = makeContext(soulStore);
      const run = makeRun();

      const result = await dispatchWriteState(
        run,
        {
          id: "w1",
          type: "write_state",
          path: "workspace.soul.sneakyPath",
          value: "v",
          next: null,
        },
        context,
      );
      assert.equal(result.kind, "fail");
      if (result.kind !== "fail") return;
      assert.match(result.reason, /agent.writable|allowlist/i);
      // Nothing was written.
      assert.equal(await soulStore.readPath("org-1", "sneakyPath"), undefined);
    } finally {
      _overrideAllowlistForTests(null);
    }
  });
});

describe("dispatchWriteState — SoulStore throws", () => {
  test("writePath throw → dispatcher returns fail", async () => {
    _overrideAllowlistForTests(new Set(["workspace.soul.x"]));
    try {
      class ThrowingStore extends InMemorySoulStore {
        async writePath(): Promise<void> {
          throw new Error("disk full");
        }
      }
      const context = makeContext(new ThrowingStore());
      const run = makeRun();
      const result = await dispatchWriteState(
        run,
        {
          id: "w1",
          type: "write_state",
          path: "workspace.soul.x",
          value: "v",
          next: null,
        },
        context,
      );
      assert.equal(result.kind, "fail");
      if (result.kind !== "fail") return;
      assert.match(result.reason, /disk full/);
    } finally {
      _overrideAllowlistForTests(null);
    }
  });
});

function emptyBlockRegistry(): BlockRegistry {
  return { tools: new Map(), producesByBlock: new Map() };
}
function emptyEventRegistry(eventType: string): EventRegistry {
  return { events: [{ type: eventType, fields: {} }] };
}
