// Event-agent "Send test" — the action's guard + bypass logic, fully DI'd.
//
// sendTestEventAgentAction is a thin wrapper: auth-gate → ownership → resolve
// skill from the trigger → resolve the review link → compose → send NOW. It runs
// here with NO DB / NO Twilio / NO Next session via the optional `_deps` arg
// (mirrors deployments/actions.ts setBookingPolicyAction's `_deps`).
//
// Pinned contract:
//   • no org session → ok:false, no send;
//   • a template the caller doesn't own → "Agent not found", no send;
//   • a NON-event (inbound) template → rejected, no send;
//   • a review agent with NO review link → the "set the review link first"
//     error path, no send (the one guard kept despite the bypass);
//   • a review agent WITH a link → sends ONCE, tagged "agent:review-requester:test";
//   • a speed-to-lead agent → sends ONCE (no link needed).
//
// Run:
//   node --import tsx --test tests/unit/agents/triggers/send-test-action.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  sendTestEventAgentAction,
  type SendTestEventAgentDeps,
} from "../../../../src/lib/agents/triggers/actions";

const ORG = "org-1";
const TEMPLATE_ID = "tmpl-1";
const REVIEW_URL = "https://g.page/r/acme-review";

type SmsCall = { orgId: string; toNumber: string; body: string; source: string };
type EmailCall = {
  orgId: string;
  toEmail: string;
  subject: string;
  body: string;
  source: string;
};

/** Build DI deps + recorders. `template` shapes the trigger/ownership; overrides
 *  patch any dep. */
function makeDeps(
  template: SendTestTemplateLike | null,
  over: Partial<SendTestEventAgentDeps> = {},
) {
  const smsCalls: SmsCall[] = [];
  const emailCalls: EmailCall[] = [];
  const deps: Partial<SendTestEventAgentDeps> = {
    getOrgId: async () => ORG,
    findTemplateById: async () => template,
    loadCustomization: async () => null,
    resolveBusinessName: async () => "Acme Plumbing",
    sendSms: async (args) => {
      smsCalls.push(args);
      return { suppressed: false };
    },
    sendEmail: async (args) => {
      emailCalls.push(args);
      return { suppressed: false };
    },
    ...over,
  };
  return { deps, smsCalls, emailCalls };
}

type SendTestTemplateLike = {
  builderOrgId: string;
  type: string;
  blueprint: { trigger?: unknown; reviewUrl?: string } | null;
};

/** A review-requester event template (booking.completed · sms). */
function reviewTemplate(reviewUrl?: string): SendTestTemplateLike {
  return {
    builderOrgId: ORG,
    type: "voice_receptionist",
    blueprint: {
      trigger: { kind: "event", event: "booking.completed", channel: "sms" },
      ...(reviewUrl ? { reviewUrl } : {}),
    },
  };
}

/** A speed-to-lead event template (lead.created · sms). */
function speedTemplate(): SendTestTemplateLike {
  return {
    builderOrgId: ORG,
    type: "chat_assistant",
    blueprint: {
      trigger: { kind: "event", event: "lead.created", channel: "sms" },
    },
  };
}

describe("sendTestEventAgentAction", () => {
  test("no org session → ok:false, no send", async () => {
    const { deps, smsCalls } = makeDeps(reviewTemplate(REVIEW_URL), {
      getOrgId: async () => null,
    });
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "+15551234567" },
      deps,
    );
    assert.equal(res.ok, false);
    assert.equal(smsCalls.length, 0);
  });

  test("template not owned by caller → 'Agent not found', no send", async () => {
    const foreign = reviewTemplate(REVIEW_URL);
    foreign.builderOrgId = "someone-else";
    const { deps, smsCalls } = makeDeps(foreign);
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "+15551234567" },
      deps,
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /not found/i);
    assert.equal(smsCalls.length, 0);
  });

  test("inbound (non-event) template → rejected, no send", async () => {
    const inbound: SendTestTemplateLike = {
      builderOrgId: ORG,
      type: "voice_receptionist",
      blueprint: { trigger: { kind: "inbound", channel: "voice" } },
    };
    const { deps, smsCalls } = makeDeps(inbound);
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "+15551234567" },
      deps,
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /outbound/i);
    assert.equal(smsCalls.length, 0);
  });

  test("review agent with NO link → sends anyway using a placeholder link (never blocks)", async () => {
    const { deps, smsCalls } = makeDeps(reviewTemplate(/* no url */), {
      // Even the deployment customization has no link.
      loadCustomization: async () => ({ reviewUrl: null }),
    });
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "+15551234567" },
      deps,
    );
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.usedPlaceholder, true);
    assert.equal(smsCalls.length, 1);
    assert.ok(smsCalls[0].body.includes("g.page/r/your-google-review-link"));
  });

  test("review agent WITH a template link → sends once, tagged :test", async () => {
    const { deps, smsCalls } = makeDeps(reviewTemplate(REVIEW_URL));
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "+15551234567" },
      deps,
    );
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.to, "+15551234567");
    assert.equal(smsCalls.length, 1);
    assert.equal(smsCalls[0].source, "agent:review-requester:test");
    assert.ok(smsCalls[0].body.includes(REVIEW_URL));
    assert.ok(smsCalls[0].body.startsWith("[TEST] "));
  });

  test("deployment review link WINS over the template default", async () => {
    const DEPLOY_URL = "https://g.page/r/client-specific";
    const { deps, smsCalls } = makeDeps(reviewTemplate(REVIEW_URL), {
      loadCustomization: async () => ({ reviewUrl: DEPLOY_URL }),
    });
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "+15551234567" },
      deps,
    );
    assert.equal(res.ok, true);
    assert.equal(smsCalls.length, 1);
    assert.ok(smsCalls[0].body.includes(DEPLOY_URL));
    assert.ok(!smsCalls[0].body.includes(REVIEW_URL));
  });

  test("speed-to-lead agent → sends once, no link needed", async () => {
    const { deps, smsCalls } = makeDeps(speedTemplate());
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "+15551234567" },
      deps,
    );
    assert.equal(res.ok, true);
    assert.equal(smsCalls.length, 1);
    assert.equal(smsCalls[0].source, "agent:speed-to-lead:test");
    assert.ok(smsCalls[0].body.startsWith("[TEST] "));
  });

  test("sms agent with empty phone → asks for a number, no send", async () => {
    const { deps, smsCalls } = makeDeps(reviewTemplate(REVIEW_URL));
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "   " },
      deps,
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /phone number/i);
    assert.equal(smsCalls.length, 0);
  });

  test("a suppressed number surfaces a clear error", async () => {
    const { deps } = makeDeps(reviewTemplate(REVIEW_URL), {
      sendSms: async () => ({ suppressed: true, reason: "opted_out" }),
    });
    const res = await sendTestEventAgentAction(
      { agentTemplateId: TEMPLATE_ID, toPhone: "+15551234567" },
      deps,
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /suppressed/i);
  });
});
