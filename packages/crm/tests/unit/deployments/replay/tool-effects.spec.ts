// Deterministic replay — ops hardening. Unit tests for the explicit
// tool-effect allowlist (lib/deployments/replay/tool-effects.ts). The
// safety-critical property is exercised end-to-end (through
// passesAllReadGate) in replay-before-llm.spec.ts's "search_and_purge
// attack" describe block — these tests cover the module's own contract in
// isolation: known tools classify correctly, unknown tools return
// undefined (never a guess).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { effectForTool, allowlistSize, listToolEffects } from "@/lib/deployments/replay/tool-effects";

describe("effectForTool — native SF tools", () => {
  test("look_up_availability is read", () => {
    assert.equal(effectForTool("look_up_availability"), "read");
  });

  test("find_my_existing_appointment is read", () => {
    assert.equal(effectForTool("find_my_existing_appointment"), "read");
  });

  test("provide_faq_answer is read", () => {
    assert.equal(effectForTool("provide_faq_answer"), "read");
  });

  test("get_quote_range is read", () => {
    assert.equal(effectForTool("get_quote_range"), "read");
  });

  test("escalate_to_human is idempotent-write (internal CRM rows only, no external send)", () => {
    assert.equal(effectForTool("escalate_to_human"), "idempotent-write");
  });

  test("draft_for_approval is idempotent-write (inert until a human approves)", () => {
    assert.equal(effectForTool("draft_for_approval"), "idempotent-write");
  });

  test("book_appointment / reschedule_appointment / cancel_appointment are destructive", () => {
    assert.equal(effectForTool("book_appointment"), "destructive");
    assert.equal(effectForTool("reschedule_appointment"), "destructive");
    assert.equal(effectForTool("cancel_appointment"), "destructive");
  });

  test("take_message is destructive (sends a real operator SMS via Twilio)", () => {
    assert.equal(effectForTool("take_message"), "destructive");
  });
});

describe("effectForTool — Composio connector tools", () => {
  test("GMAIL_SEND_EMAIL and OUTLOOK_SEND_EMAIL are destructive (send-class)", () => {
    assert.equal(effectForTool("GMAIL_SEND_EMAIL"), "destructive");
    assert.equal(effectForTool("OUTLOOK_SEND_EMAIL"), "destructive");
  });

  test("SLACK_SEND_MESSAGE is destructive (posts externally)", () => {
    assert.equal(effectForTool("SLACK_SEND_MESSAGE"), "destructive");
  });

  test("calendar CREATE_EVENT actions are destructive (books, typically invites attendees)", () => {
    assert.equal(effectForTool("GOOGLECALENDAR_CREATE_EVENT"), "destructive");
    assert.equal(effectForTool("OUTLOOK_CALENDAR_CREATE_EVENT"), "destructive");
  });

  test("QUICKBOOKS_CREATE_INVOICE is destructive (issues a real invoice)", () => {
    assert.equal(effectForTool("QUICKBOOKS_CREATE_INVOICE"), "destructive");
  });

  test("fetch/list/find/search/get/query/download actions are read", () => {
    assert.equal(effectForTool("GMAIL_FETCH_EMAILS"), "read");
    assert.equal(effectForTool("GMAIL_LIST_LABELS"), "read");
    assert.equal(effectForTool("GOOGLECALENDAR_FIND_EVENT"), "read");
    assert.equal(effectForTool("NOTION_SEARCH"), "read");
    assert.equal(effectForTool("HUBSPOT_SEARCH_CONTACTS"), "read");
    assert.equal(effectForTool("QUICKBOOKS_LIST_INVOICES"), "read");
    assert.equal(effectForTool("OUTLOOK_CALENDAR_GET_SCHEDULE"), "read");
    assert.equal(effectForTool("NOTION_QUERY_DATABASE"), "read");
    assert.equal(effectForTool("GOOGLEDRIVE_DOWNLOAD_FILE"), "read");
  });

  test("account-internal mutations (drafts, labels, CRM/file records) are idempotent-write", () => {
    assert.equal(effectForTool("GMAIL_CREATE_EMAIL_DRAFT"), "idempotent-write");
    assert.equal(effectForTool("GMAIL_ADD_LABEL_TO_EMAIL"), "idempotent-write");
    assert.equal(effectForTool("NOTION_CREATE_PAGE"), "idempotent-write");
    assert.equal(effectForTool("HUBSPOT_CREATE_CONTACT"), "idempotent-write");
    assert.equal(effectForTool("HUBSPOT_CREATE_DEAL"), "idempotent-write");
    assert.equal(effectForTool("QUICKBOOKS_CREATE_CUSTOMER"), "idempotent-write");
    assert.equal(effectForTool("OUTLOOK_BATCH_MOVE_MESSAGES"), "idempotent-write");
    assert.equal(effectForTool("OUTLOOK_UPDATE_EMAIL_MESSAGE"), "idempotent-write");
    assert.equal(effectForTool("GOOGLEDRIVE_CREATE_FILE"), "idempotent-write");
  });
});

describe("effectForTool — unknown tools", () => {
  test("an unknown/typo'd/hypothetical tool name returns undefined, never a guess", () => {
    assert.equal(effectForTool("search_and_purge"), undefined);
    assert.equal(effectForTool("SOME_RANDOM_TOOLKIT_ACTION"), undefined);
    assert.equal(effectForTool(""), undefined);
  });
});

describe("allowlistSize / listToolEffects", () => {
  test("allowlistSize matches the number of entries listToolEffects returns", () => {
    assert.equal(allowlistSize(), listToolEffects().length);
  });

  test("allowlist has a non-trivial number of classified tools", () => {
    assert.ok(allowlistSize() >= 30, `expected >= 30 classified tools, got ${allowlistSize()}`);
  });

  test("every listed effect is one of the three valid ReelierEffect values", () => {
    const valid = new Set(["read", "idempotent-write", "destructive"]);
    for (const [name, effect] of listToolEffects()) {
      assert.ok(valid.has(effect), `${name} has invalid effect ${effect}`);
    }
  });
});
