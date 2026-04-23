// Tests for the read_state dispatcher + Zod schema. SLICE 3 C1 per
// audit §3.1 + G-3-1 (Zod enum, "soul"-only MVP).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  AgentSpecSchema,
  validateAgentSpec,
  type AgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../../src/lib/agents/validator";
import { dispatchReadState } from "../../../src/lib/workflow/step-dispatchers/read-state";
import { InMemorySoulStore } from "../../../src/lib/workflow/state-access/soul-store-memory";
import type { RuntimeContext, StoredRun } from "../../../src/lib/workflow/types";
import { notImplementedToolInvoker } from "../../../src/lib/workflow/types";
import { InMemoryRuntimeStorage } from "./storage-memory";

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
    currentStepId: "read1",
    captureScope: {},
    variableScope: {},
    failureCount: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("read_state Zod schema — G-3-1 enum-only source", () => {
  test("accepts valid read_state step with source=soul", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "r1",
          type: "read_state",
          source: "soul",
          path: "workspace.soul.businessName",
          capture: "bizName",
          next: null,
        },
      ],
    };
    const result = AgentSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });

  test("rejects unknown source values via validateAgentSpec (L-22 structural)", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "r1",
            type: "read_state",
            source: "event_log", // not in v1 enum
            path: "workspace.soul.x",
            capture: "x",
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      emptyEventRegistry("contact.created"),
    );
    assert.ok(
      issues.some((i) => i.code === "spec_malformed" && i.path === "source"),
      "non-'soul' source must surface spec_malformed on the source path",
    );
  });

  test("rejects missing capture field via validateAgentSpec", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "r1",
            type: "read_state",
            source: "soul",
            path: "workspace.soul.x",
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      emptyEventRegistry("contact.created"),
    );
    assert.ok(
      issues.some((i) => i.code === "spec_malformed" && /capture/.test(i.path)),
      "read_state without capture must surface spec_malformed",
    );
  });

  test("rejects path that doesn't start with workspace.soul. or workspace.theme.", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "r1",
            type: "read_state",
            source: "soul",
            path: "randomFieldName",
            capture: "x",
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      emptyEventRegistry("contact.created"),
    );
    assert.ok(
      issues.some((i) => i.code === "spec_malformed" && i.path === "path"),
      "non-workspace.soul/theme path must surface spec_malformed on the path field",
    );
  });
});

function emptyBlockRegistry(): BlockRegistry {
  return { tools: new Map(), producesByBlock: new Map() };
}
function emptyEventRegistry(eventType: string): EventRegistry {
  return { events: [{ type: eventType, fields: {} }] };
}

describe("dispatchReadState — happy path", () => {
  test("reads a Soul value + binds it under the capture name", async () => {
    const soulStore = new InMemorySoulStore();
    soulStore._seed("org-1", { businessName: "Acme Corp" });
    const context = makeContext(soulStore);
    const run = makeRun();

    const result = await dispatchReadState(
      run,
      {
        id: "r1",
        type: "read_state",
        source: "soul",
        path: "workspace.soul.businessName",
        capture: "bizName",
        next: "next_step",
      },
      context,
    );

    assert.equal(result.kind, "advance");
    if (result.kind !== "advance") return;
    assert.equal(result.next, "next_step");
    assert.deepEqual(result.capture, { name: "bizName", value: "Acme Corp" });
  });

  test("walks nested Soul paths", async () => {
    const soulStore = new InMemorySoulStore();
    soulStore._seed("org-1", {
      pipeline: { name: "Sales", stages: [{ name: "Lead" }] },
    });
    const context = makeContext(soulStore);
    const run = makeRun();

    const result = await dispatchReadState(
      run,
      {
        id: "r1",
        type: "read_state",
        source: "soul",
        path: "workspace.soul.pipeline.name",
        capture: "pipelineName",
        next: null,
      },
      context,
    );

    assert.equal(result.kind, "advance");
    if (result.kind !== "advance") return;
    assert.deepEqual(result.capture, { name: "pipelineName", value: "Sales" });
  });

  test("missing path → captures undefined (not a failure)", async () => {
    const soulStore = new InMemorySoulStore();
    soulStore._seed("org-1", { businessName: "Acme" });
    const context = makeContext(soulStore);
    const run = makeRun();

    const result = await dispatchReadState(
      run,
      {
        id: "r1",
        type: "read_state",
        source: "soul",
        path: "workspace.soul.missingField",
        capture: "v",
        next: null,
      },
      context,
    );
    assert.equal(result.kind, "advance");
    if (result.kind !== "advance") return;
    assert.deepEqual(result.capture, { name: "v", value: undefined });
  });
});

describe("dispatchReadState — interpolation in path", () => {
  test("resolves {{capture.field}} in the path before reading", async () => {
    const soulStore = new InMemorySoulStore();
    soulStore._seed("org-1", {
      contact: { alice: { email: "alice@example.com" } },
    });
    const context = makeContext(soulStore);
    const run = makeRun({
      captureScope: { selected: { key: "alice" } },
    });

    const result = await dispatchReadState(
      run,
      {
        id: "r1",
        type: "read_state",
        source: "soul",
        path: "workspace.soul.contact.{{selected.key}}.email",
        capture: "contactEmail",
        next: null,
      },
      context,
    );

    assert.equal(result.kind, "advance");
    if (result.kind !== "advance") return;
    assert.deepEqual(result.capture, { name: "contactEmail", value: "alice@example.com" });
  });
});

describe("dispatchReadState — workspace.theme path", () => {
  test("workspace.theme.* paths route to the theme slice of Soul", async () => {
    const soulStore = new InMemorySoulStore();
    // The in-memory store treats workspace.soul.* + workspace.theme.*
    // as two subtrees of the JSONB. The dispatcher strips the
    // workspace.<slice>. prefix and asks for the remainder.
    soulStore._seedTheme("org-1", { brandColor: "#FF6B6B" });
    const context = makeContext(soulStore);
    const run = makeRun();

    const result = await dispatchReadState(
      run,
      {
        id: "r1",
        type: "read_state",
        source: "soul", // still "soul" per G-3-1 enum; path prefix differentiates
        path: "workspace.theme.brandColor",
        capture: "brand",
        next: null,
      },
      context,
    );
    assert.equal(result.kind, "advance");
    if (result.kind !== "advance") return;
    assert.deepEqual(result.capture, { name: "brand", value: "#FF6B6B" });
  });
});

describe("dispatchReadState — SoulStore throws", () => {
  test("SoulStore throws → dispatcher returns fail", async () => {
    class ThrowingSoulStore extends InMemorySoulStore {
      async readPath(): Promise<unknown> {
        throw new Error("db connection lost");
      }
    }
    const context = makeContext(new ThrowingSoulStore());
    const run = makeRun();

    const result = await dispatchReadState(
      run,
      {
        id: "r1",
        type: "read_state",
        source: "soul",
        path: "workspace.soul.x",
        capture: "x",
        next: null,
      },
      context,
    );
    assert.equal(result.kind, "fail");
    if (result.kind !== "fail") return;
    assert.match(result.reason, /db connection lost/);
  });
});
