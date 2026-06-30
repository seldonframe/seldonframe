// format — the pure human-output renderers. Pins price/money formatting and the
// honest billing line (charged reflects the API; cost shown even when not charged).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatPrice,
  formatMoney,
  formatDiscover,
  formatInspect,
  formatRun,
  formatWallet,
  formatKeysList,
} from "../src/lib/format.js";

describe("formatPrice", () => {
  test("zero / missing → free", () => {
    assert.equal(formatPrice({ type: "per_call", amountCents: 0 }), "free");
    assert.equal(formatPrice(undefined), "free");
  });

  test("per_call / per_outcome render with the unit", () => {
    assert.equal(formatPrice({ type: "per_call", amountCents: 10 }), "$0.10/call");
    assert.equal(
      formatPrice({ type: "per_outcome", amountCents: 1000, outcomeType: "booking" }),
      "$10.00/booking",
    );
  });
});

describe("formatMoney", () => {
  test("renders value + currency", () => {
    assert.equal(formatMoney({ value: 20, currency: "USD" }), "$20.00 USD");
    assert.equal(formatMoney(undefined), "$0.00 USD");
  });
});

describe("formatDiscover", () => {
  test("lists results with id + price; tools show their provider", () => {
    const out = formatDiscover({
      count: 2,
      results: [
        {
          id: "ace",
          type: "agent",
          name: "Receptionist",
          description: "Answers calls.",
          price: { type: "per_call", amountCents: 10 },
          score: 5,
        },
        {
          id: "GMAIL_SEND_EMAIL",
          type: "tool",
          provider: "gmail",
          name: "Gmail — Send Email",
          description: "Send an email.",
          price: { type: "per_call", amountCents: 0 },
          score: 3,
        },
      ],
    });
    assert.match(out, /Receptionist/);
    assert.match(out, /id: ace/);
    assert.match(out, /\$0\.10\/call/);
    assert.match(out, /\[tool:gmail\]/);
    assert.match(out, /free/);
  });

  test("empty results → No results.", () => {
    assert.equal(formatDiscover({ count: 0, results: [] }), "No results.");
  });
});

describe("formatInspect", () => {
  test("shows price, the input schema fields, and required markers", () => {
    const out = formatInspect({
      id: "ace",
      type: "agent",
      name: "Receptionist",
      description: "Answers calls.",
      price: { type: "per_call", amountCents: 10 },
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "What to say." },
          conversationId: { type: "string" },
        },
        required: ["message"],
      },
      capabilities: ["book", "qualify"],
      docUrl: "https://docs.example.com",
    });
    assert.match(out, /\$0\.10\/call/);
    assert.match(out, /message: string \(required\) — What to say\./);
    assert.match(out, /conversationId: string/);
    assert.match(out, /Capabilities: book, qualify/);
    assert.match(out, /Docs: https:\/\/docs\.example\.com/);
  });

  test("an empty schema notes it's free-form", () => {
    const out = formatInspect({
      id: "x",
      type: "tool",
      name: "X",
      description: "",
      price: { type: "per_call", amountCents: 0 },
      inputSchema: { type: "object", properties: {} },
    });
    assert.match(out, /free-form/);
  });
});

describe("formatRun", () => {
  test("shows the run id, status, output, and an HONEST billing block", () => {
    const out = formatRun({
      runId: "run_abc",
      status: "completed",
      output: { reply: "Yes we do." },
      price: { type: "per_call", amountCents: 10 },
      billing: {
        calculatedCost: 100000,
        amountCents: 10,
        feeCents: 1,
        netCents: 9,
        charged: false,
        recorded: false,
      },
    });
    assert.match(out, /run:    run_abc/);
    assert.match(out, /status: completed/);
    assert.match(out, /Yes we do\./);
    assert.match(out, /cost:     \$0\.10/);
    // charged honestly false → the CLI says so, not "charged".
    assert.match(out, /charged:  no/);
    assert.match(out, /not charged/);
  });

  test("a charged run shows the remaining balance", () => {
    const out = formatRun({
      runId: "run_x",
      status: "completed",
      output: "done",
      price: { type: "per_call", amountCents: 10 },
      billing: {
        calculatedCost: 100000,
        amountCents: 10,
        feeCents: 1,
        netCents: 9,
        charged: true,
        recorded: true,
        balanceMicros: 5_000_000,
      },
    });
    assert.match(out, /charged:  yes/);
    assert.match(out, /balance:  \$5\.00 remaining/);
  });

  test("an errored run surfaces the error and charges nothing", () => {
    const out = formatRun({
      runId: "run_e",
      status: "error",
      error: "The agent failed to respond.",
      price: { type: "per_call", amountCents: 0 },
      billing: { calculatedCost: 0, amountCents: 0, feeCents: 0, netCents: 0, charged: false, recorded: false },
    });
    assert.match(out, /status: error/);
    assert.match(out, /The agent failed to respond\./);
    assert.match(out, /charged:  no/);
  });
});

describe("formatWallet", () => {
  test("shows balance + earnings", () => {
    const out = formatWallet({
      balance: { value: 20, currency: "USD" },
      earnings: { value: 3.5, currency: "USD" },
    });
    assert.match(out, /balance:  \$20\.00 USD/);
    assert.match(out, /earnings: \$3\.50 USD/);
  });
});

describe("formatKeysList", () => {
  test("marks the active key and masks all keys", () => {
    const out = formatKeysList([
      { label: "main", masked: "wst_…aaaa", active: true },
      { label: "alt", masked: "wst_…bbbb", active: false },
    ]);
    assert.match(out, /\* main {2}wst_…aaaa/);
    assert.match(out, /  alt {2}wst_…bbbb/);
  });

  test("empty → an add hint", () => {
    assert.match(formatKeysList([]), /keys add/);
  });
});
