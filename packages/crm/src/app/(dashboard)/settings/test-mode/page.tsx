// Workspace test-mode settings page.
// SLICE 8 C5 per audit §5.1 + gates G-8-1, G-8-3, G-8-4.
//
// Composes existing settings page primitives + Checkbox.
// No new shadcn primitives. UI multiplier per L-17 0.94x baseline.

import { redirect } from "next/navigation";

import { db } from "@/db";
import { getOrgId } from "@/lib/auth/helpers";
import { setWorkspaceTestModeAction } from "@/lib/test-mode/actions";
import { DrizzleWorkspaceTestModeStore } from "@/lib/test-mode/store-drizzle";

export const dynamic = "force-dynamic";

export default async function TestModeSettingsPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    redirect("/login");
  }

  const store = new DrizzleWorkspaceTestModeStore(db);
  const state = await store.loadWorkspaceTestMode(orgId);

  const hasTwilioTest = Boolean(state.twilio);
  const hasResendTest = Boolean(state.resend);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title">Test mode</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          When test mode is on, outbound SMS and email use sandbox endpoints
          configured per provider. Inbound webhooks, scheduled triggers, and
          message triggers continue to fire normally — only the leaf send
          calls route to test credentials.
        </p>
      </div>

      <form
        action={setWorkspaceTestModeAction}
        className="crm-card flex items-center justify-between gap-4 p-4"
      >
        <div>
          <p className="text-sm font-medium">
            Test mode is currently{" "}
            <span className={state.enabled ? "text-caution" : "text-positive"}>
              {state.enabled ? "ON" : "OFF"}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Toggle changes apply to all future sends, including queued ones.
          </p>
        </div>
        <button
          type="submit"
          name="testMode"
          value={state.enabled ? "false" : "true"}
          className="crm-button-primary h-9 px-4 text-sm"
        >
          {state.enabled ? "Disable test mode" : "Enable test mode"}
        </button>
      </form>

      <div className="crm-card space-y-3 p-4">
        <h2 className="text-sm font-medium">Test credentials</h2>
        <p className="text-xs text-muted-foreground">
          Per-provider test credentials. When test mode is on AND a provider
          has test credentials configured, sends route to that provider&apos;s
          sandbox. When test mode is on AND credentials are missing, sends
          for that provider fail with a specific error.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span>Twilio (SMS)</span>
            <span
              className={
                hasTwilioTest
                  ? "text-positive text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {hasTwilioTest ? "configured" : "not configured"}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>Resend (email)</span>
            <span
              className={
                hasResendTest
                  ? "text-positive text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {hasResendTest ? "configured" : "not configured"}
            </span>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Test credentials are configured via the SeldonFrame API
          (PATCH /api/v1/integrations) — UI authoring will ship in a
          follow-up slice.
        </p>
      </div>

      <div className="crm-card space-y-2 p-4">
        <h2 className="text-sm font-medium">What does test mode do?</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>SMS sends route to your configured Twilio test credentials (e.g., magic test numbers like +15005550006).</li>
          <li>Email sends route to your configured Resend test API key (re_test_*).</li>
          <li>Stripe payments are NOT yet workspace-scoped for test mode (deferred to SLICE 8b).</li>
          <li>All other workflow runtime behavior — schedules, message triggers, branches, conversation runtime — runs identically.</li>
          <li>Test events are tagged with <code>testMode: true</code> in workflow_event_log for observability.</li>
        </ul>
      </div>

      {/* SLICE 9 PR 2 C11 — vertical-archetype guidance for test mode.
          Surfaces concretely what test mode does for the HVAC archetype
          set so an operator running through the launch demo knows what
          to expect when they fire a workflow with test mode on. */}
      <div className="crm-card space-y-2 p-4">
        <h2 className="text-sm font-medium">Running an HVAC archetype in test mode</h2>
        <p className="text-xs text-muted-foreground">
          The vertical archetypes shipped in <code>hvac-arizona</code>{" "}
          honor workspace test mode out of the box:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>
            <strong>Heat Advisory Outreach</strong> — schedule + external
            weather check still runs at 5am Phoenix time, but the
            outbound SMS to vulnerable customers routes to your Twilio
            sandbox numbers. Real customers do not receive the text.
          </li>
          <li>
            <strong>Emergency SMS Triage</strong> — inbound message
            triggers fire normally so you can replay an EMERGENCY text
            from a sandbox number; the priority acknowledgment SMS
            routes to sandbox; the on-call paging emit_event still fires
            so you can see the dispatch decision in the dashboard.
          </li>
          <li>
            <strong>Post-Service Follow-Up</strong> — the
            <code>payment.completed</code> subscription still fires on
            test-mode payments (note: Stripe test-mode workspace scoping
            is SLICE 8b), the 24h wait still elapses, satisfaction +
            review-request SMSes route to sandbox.
          </li>
          <li>
            <strong>Pre-Season Maintenance</strong> — the daily schedule
            still scans your customer book; reminder SMSes route to
            sandbox.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Tip: when running the launch walkthrough, leave test mode
          ON until you&apos;ve replayed each archetype and confirmed
          the workflow_runs table shows the expected step trace —
          then disable to go live.
        </p>
      </div>
    </div>
  );
}
