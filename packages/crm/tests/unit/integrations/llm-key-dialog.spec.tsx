// packages/crm/tests/unit/integrations/llm-key-dialog.spec.tsx
//
// Record v3 (T1) — <LlmKeyDialog>: in-place BYOK modal. Covers the
// fail-soft contract (Optimistic Path rule): a save error must stay
// visible IN the dialog, never silently close it. Success closes + fires
// onSaved so the blocked caller (refine/test/evals) can retry.
//
// jsdom bootstrap MUST be the first import (CI gotcha — see
// tests/setup-dom.ts's header) so base-ui's Dialog mounts into a real DOM.
import "../../setup-dom";

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import React from "react";

import { LlmKeyDialog } from "../../../src/components/integrations/llm-key-dialog";
import type { SaveLlmKeyResult } from "../../../src/lib/integrations/llm/actions";

afterEach(() => cleanup());

describe("<LlmKeyDialog>", () => {
  test("renders the Anthropic key field when open", () => {
    render(<LlmKeyDialog open={true} onOpenChange={() => {}} action={async () => ({ ok: true, provider: "anthropic" })} />);
    assert.ok(screen.getAllByLabelText(/anthropic api key/i).length > 0, "key field not rendered");
  });

  test("save success calls onSaved and closes the dialog", async () => {
    let openState = true;
    let savedCalled = false;
    const action = async (): Promise<SaveLlmKeyResult> => ({ ok: true, provider: "anthropic" });

    render(
      <LlmKeyDialog
        open={openState}
        onOpenChange={(next) => {
          openState = next;
        }}
        onSaved={() => {
          savedCalled = true;
        }}
        action={action}
      />,
    );

    const input = screen.getByLabelText(/anthropic api key/i);
    fireEvent.change(input, { target: { value: "sk-ant-abc12345" } });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() => {
      assert.equal(openState, false, "dialog should close on success");
    });
    assert.equal(savedCalled, true, "onSaved should fire on success");
  });

  test("save error stays open and shows the message — never silently closes", async () => {
    let openState = true;
    const action = async (): Promise<SaveLlmKeyResult> => ({
      ok: false,
      error: "Anthropic keys start with sk-ant-",
    });

    render(
      <LlmKeyDialog
        open={openState}
        onOpenChange={(next) => {
          openState = next;
        }}
        action={action}
      />,
    );

    const input = screen.getByLabelText(/anthropic api key/i);
    fireEvent.change(input, { target: { value: "bad-key" } });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() => {
      assert.ok(
        screen.getAllByText(/anthropic keys start with sk-ant-/i).length > 0,
        "error message not shown",
      );
    });
    assert.equal(openState, true, "dialog must stay open on error — no silent close");
  });
});
