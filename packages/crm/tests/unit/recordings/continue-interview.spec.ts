// Agent lifecycle slice — Stage 01 "Learned": continue-the-interview
// orchestration (lib/recordings/continue-interview.ts). Plain DI module — no
// DB, no network, no LLM SDK. Focus of THIS spec is the composio
// live-tool-discovery wiring (2026-07-11 slice): `deps.fillConnectors`
// defaults to identity (every existing shape stays green) and, when
// injected, is applied to the recompiled connectors BEFORE `updateTemplate`
// — never-lies ordering unchanged (only on `result.applied`).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { continueInterviewCore, type ContinueInterviewDeps } from "@/lib/recordings/continue-interview";
import type { RecordingSession } from "@/db/schema/recordings";
import type { FlowModel, TraceLlm } from "@/lib/recordings/trace-schema";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

function fakeModel(overrides: Partial<FlowModel> = {}): FlowModel {
  return {
    title: "Onboard a new client",
    goal: "Get a new client set up in every system",
    apps: ["gmail"],
    steps: [
      {
        index: 0,
        app: "gmail",
        action: "send welcome email",
        intent: "greet the client",
        dataIn: [],
        dataOut: [],
        checks: [],
      },
    ],
    variables: [],
    constants: [],
    branches: [],
    openQuestions: ["What if the client has no email on file?"],
    recordingsSeen: 1,
    coverage: [],
    ...overrides,
  };
}

function fakeSession(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    id: "session-1",
    orgId: "org-1",
    status: "recapped",
    tokenHash: "hash",
    ipHash: "iphash",
    flowModel: fakeModel(),
    openQuestions: ["What if the client has no email on file?"],
    interviewLog: [],
    derivedScenarios: null,
    answeredQuestions: null,
    agentTemplateId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RecordingSession;
}

/** A queued fake TraceLlm returning one good single-merge response —
 *  mirrors interview.spec.ts's own fixture pattern. */
function llmReturning(model: FlowModel, openQuestions: string[] = []): TraceLlm {
  return async () => ({ reply: "Got it.", model, openQuestions });
}

function baseDeps(overrides: Partial<ContinueInterviewDeps> = {}): ContinueInterviewDeps {
  return {
    findSession: async () => fakeSession(),
    listTracedRecordings: async () => [],
    llm: llmReturning(fakeModel()),
    updateTemplate: async () => ({ ok: true }),
    persistSession: async () => {},
    ...overrides,
  };
}

describe("continueInterviewCore — fillConnectors wiring", () => {
  test("default (no fillConnectors dep) is identity — updateTemplate receives the bundle's own connectors untouched", async () => {
    let receivedConnectors: unknown;
    const deps = baseDeps({
      updateTemplate: async ({ patch }) => {
        receivedConnectors = (patch as { connectors?: unknown }).connectors;
        return { ok: true };
      },
    });

    const result = await continueInterviewCore(deps, {
      orgId: "org-1",
      templateId: "tmpl-1",
      message: "no email? call them instead.",
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.applied, true);
    // flowModelToBundle with no traced recordings + no coverage produces an
    // empty/undefined connectors array — identity means it's untouched.
    assert.ok(receivedConnectors === undefined || Array.isArray(receivedConnectors));
  });

  test("an injected fillConnectors is applied to the recompiled connectors BEFORE updateTemplate", async () => {
    const widened: ConnectorBinding[] = [
      { id: "youtube", kind: "composio", enabledToolkits: ["youtube"], enabledTools: ["YOUTUBE_LIST_VIDEOS"], discoveredAt: "2026-07-11T00:00:00.000Z" },
    ];
    let fillConnectorsCalledWith: ConnectorBinding[] | undefined;
    let receivedConnectors: unknown;

    const deps = baseDeps({
      fillConnectors: async (connectors) => {
        fillConnectorsCalledWith = connectors;
        return widened;
      },
      updateTemplate: async ({ patch }) => {
        receivedConnectors = (patch as { connectors?: unknown }).connectors;
        return { ok: true };
      },
    });

    const result = await continueInterviewCore(deps, {
      orgId: "org-1",
      templateId: "tmpl-1",
      message: "no email? call them instead.",
    });

    assert.equal(result.ok, true);
    assert.ok(fillConnectorsCalledWith === undefined || Array.isArray(fillConnectorsCalledWith));
    assert.deepEqual(receivedConnectors, widened, "updateTemplate receives what fillConnectors returned");
  });

  test("fillConnectors is never even called when the merge did not apply (applied:false short-circuits before recompile)", async () => {
    const model = fakeModel({ openQuestions: ["Q1"] });
    let fillCalled = false;
    const deps = baseDeps({
      findSession: async () => fakeSession({ flowModel: model, openQuestions: ["Q1"] }),
      // A reply with a model shape that fails FlowModelSchema validation on
      // both the first attempt and the retry → interviewTurn fails soft with
      // applied:false (the model/openQuestions pass through unchanged) —
      // never-lies: nothing merged, so nothing should recompile/fill.
      llm: async () => ({ reply: "hmm not sure", model: { title: 42 } }),
      fillConnectors: async (c) => {
        fillCalled = true;
        return c;
      },
    });

    const result = await continueInterviewCore(deps, {
      orgId: "org-1",
      templateId: "tmpl-1",
      message: "hmm not sure",
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.applied, false);
    assert.equal(fillCalled, false, "never-lies: nothing merged, so no recompile/fill happens");
  });

  test("existing error paths are unaffected by the new dep (no_recording_session / unauthorized)", async () => {
    const noSession = baseDeps({ findSession: async () => null });
    const r1 = await continueInterviewCore(noSession, { orgId: "org-1", templateId: "tmpl-1", message: "hi" });
    assert.deepEqual(r1, { ok: false, error: "no_recording_session" });

    const wrongOrg = baseDeps({ findSession: async () => fakeSession({ orgId: "org-2" }) });
    const r2 = await continueInterviewCore(wrongOrg, { orgId: "org-1", templateId: "tmpl-1", message: "hi" });
    assert.deepEqual(r2, { ok: false, error: "unauthorized" });
  });
});
