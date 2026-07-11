// T4 — continue-the-interview server action (agent lifecycle slice, Stage 01
// "Learned"). Tests exercise `continueInterviewCore` directly with fake deps
// (no DB, no network) — it lives in lib/recordings/continue-interview.ts (a
// plain module) precisely so importing it never drags in
// lib/agent-templates/interview-actions.ts's `getOrgId`/next-auth import
// chain. `continueInterviewAction` is the thin "use server" wrapper that
// resolves the real org id + assembles real deps (not exercised here).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { continueInterviewCore } from "@/lib/recordings/continue-interview";
import type { RecordingSession } from "@/db/schema/recordings";
import type { FlowModel, TraceLlm } from "@/lib/recordings/trace-schema";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";
const SESSION_ID = "sess-1";

function fakeModel(overrides: Partial<FlowModel> = {}): FlowModel {
  return {
    title: "Onboard a new client",
    goal: "Get a new client set up in every system",
    apps: ["gmail"],
    steps: [
      { index: 0, app: "gmail", action: "send welcome email", intent: "greet the client", dataIn: [], dataOut: [], checks: [] },
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
    id: SESSION_ID,
    orgId: ORG_ID,
    status: "compiled",
    tokenHash: "hash",
    ipHash: "iphash",
    flowModel: fakeModel(),
    openQuestions: fakeModel().openQuestions,
    interviewLog: [],
    derivedScenarios: null,
    answeredQuestions: null,
    agentTemplateId: TEMPLATE_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RecordingSession;
}

function queueLlm(responses: unknown[]): TraceLlm {
  const queue = [...responses];
  return async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("fake llm: no more queued responses");
    return next;
  };
}

describe("continueInterviewCore", () => {
  test("applied happy path: recompiles the template with the regenerated skill-md and persists the Q&A + answeredQuestions", async () => {
    const updatedModel = fakeModel({ constants: ["always cc the office manager"], openQuestions: [] });
    const llm = queueLlm([
      { reply: "Got it — I'll always cc the office manager.", model: updatedModel, openQuestions: [] },
    ]);

    let updateCalledWith: unknown = null;
    let persistCalledWith: unknown = null;

    const result = await continueInterviewCore(
      {
        findSession: async (templateId) => {
          assert.equal(templateId, TEMPLATE_ID);
          return fakeSession();
        },
        listTracedRecordings: async (sessionId) => {
          assert.equal(sessionId, SESSION_ID);
          return [{ label: "Happy path", trace: fakeModel() }];
        },
        llm,
        updateTemplate: async (input) => {
          updateCalledWith = input;
          return { ok: true };
        },
        persistSession: async (input) => {
          persistCalledWith = input;
        },
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, message: "Always cc the office manager on the welcome email." },
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.applied, true);
      assert.equal(result.reply, "Got it — I'll always cc the office manager.");
      assert.deepEqual(result.openQuestions, []);
    }
    assert.ok(updateCalledWith, "expected updateTemplate to be called");
    const patch = (updateCalledWith as { patch: { customSkillMd?: string } }).patch;
    assert.match(patch.customSkillMd ?? "", /always cc the office manager/);
    assert.ok(persistCalledWith, "expected persistSession to be called");
    const persisted = persistCalledWith as { answeredPairs: Array<{ question: string | null; answer: string }> };
    assert.equal(persisted.answeredPairs.length, 1);
    assert.equal(persisted.answeredPairs[0].answer, "Always cc the office manager on the welcome email.");
    assert.equal(persisted.answeredPairs[0].question, null);
  });

  test("applied:false → no recompile, no answered-question append", async () => {
    const model = fakeModel();
    const llm = queueLlm([
      { reply: "oops", model: { title: "" }, openQuestions: [] },
      { reply: "still oops", model: { title: "" }, openQuestions: [] },
    ]);

    let updateCalled = false;
    let persistCalled = false;

    const result = await continueInterviewCore(
      {
        findSession: async () => fakeSession({ flowModel: model, openQuestions: model.openQuestions }),
        listTracedRecordings: async () => [],
        llm,
        updateTemplate: async () => {
          updateCalled = true;
          return { ok: true };
        },
        persistSession: async () => {
          persistCalled = true;
        },
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, message: "an unusable answer" },
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.applied, false);
      assert.match(result.reply, /couldn't apply|could not|rephrase/i);
    }
    assert.equal(updateCalled, false, "recompile must NOT run when the merge didn't apply");
    assert.equal(persistCalled, false, "no Q&A append when the merge didn't apply");
  });

  test("template without a linked recording session → ok:false clean error", async () => {
    const result = await continueInterviewCore(
      {
        findSession: async () => null,
        listTracedRecordings: async () => [],
        llm: queueLlm([]),
        updateTemplate: async () => ({ ok: true }),
        persistSession: async () => {},
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, message: "hello" },
    );
    assert.deepEqual(result, { ok: false, error: "no_recording_session" });
  });

  test("session belongs to a different org → ok:false unauthorized (org-scope invariant)", async () => {
    const result = await continueInterviewCore(
      {
        findSession: async () => fakeSession({ orgId: "some-other-org" }),
        listTracedRecordings: async () => [],
        llm: queueLlm([]),
        updateTemplate: async () => ({ ok: true }),
        persistSession: async () => {},
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, message: "hello" },
    );
    assert.deepEqual(result, { ok: false, error: "unauthorized" });
  });

  test("session has no flowModel yet → ok:false clean error", async () => {
    const result = await continueInterviewCore(
      {
        findSession: async () => fakeSession({ flowModel: null }),
        listTracedRecordings: async () => [],
        llm: queueLlm([]),
        updateTemplate: async () => ({ ok: true }),
        persistSession: async () => {},
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, message: "hello" },
    );
    assert.deepEqual(result, { ok: false, error: "no_flow_model" });
  });

  test("recompile write fails → ok:false, never claims an update it didn't persist (never-lies)", async () => {
    const updatedModel = fakeModel({ constants: ["x"], openQuestions: [] });
    const llm = queueLlm([{ reply: "Got it.", model: updatedModel, openQuestions: [] }]);
    let persistCalled = false;

    const result = await continueInterviewCore(
      {
        findSession: async () => fakeSession(),
        listTracedRecordings: async () => [],
        llm,
        updateTemplate: async () => ({ ok: false }),
        persistSession: async () => {
          persistCalled = true;
        },
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, message: "some answer" },
    );

    assert.equal(result.ok, false);
    assert.equal(persistCalled, false);
  });
});
