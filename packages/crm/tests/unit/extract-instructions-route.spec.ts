// packages/crm/tests/unit/extract-instructions-route.spec.ts
//
// 2026-05-14 — Unit tests for GET /api/v1/workspace/extract-instructions.
// The endpoint is pure-data (no fetching, no LLM, no auth) so we can call
// the GET handler directly with a synthetic Request — no HTTP server.

import { test } from "node:test";
import assert from "node:assert/strict";

import { GET } from "../../src/app/api/v1/workspace/extract-instructions/route";

function makeRequest(searchParams: Record<string, string>): Request {
  const url = new URL("http://localhost/api/v1/workspace/extract-instructions");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

test("returns 400 when ?url is missing", async () => {
  const res = await GET(makeRequest({}));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? "", /missing.*url/i);
});

test("returns 200 with playbook shape when ?url present", async () => {
  const targetUrl = "https://quigleyac.com";
  const res = await GET(makeRequest({ url: targetUrl }));
  assert.equal(res.status, 200);

  const body = (await res.json()) as {
    status: string;
    url_echo: string;
    instructions: string;
    required_fields_schema: { required: string[] };
    next_tool: string;
  };

  assert.equal(body.status, "instructions");
  assert.equal(body.url_echo, targetUrl);
  assert.equal(typeof body.instructions, "string");
  assert.equal(body.next_tool, "create_workspace_v2");

  // Sanity: instructions actually mention WebFetch + the URL was substituted
  assert.match(body.instructions, /WebFetch/);
  assert.match(body.instructions, new RegExp(targetUrl.replace(/[.]/g, "\\.")));
  assert.ok(
    !body.instructions.includes("{url_echo}"),
    "instructions still contains an unsubstituted {url_echo} placeholder"
  );

  // Required fields contract — these must stay exact; downstream
  // create_workspace_v2 enforces them.
  for (const field of [
    "business_name",
    "city",
    "state",
    "phone",
    "services",
    "business_description",
  ]) {
    assert.ok(
      body.required_fields_schema.required.includes(field),
      `required_fields_schema.required is missing ${field}`
    );
  }
});

test("instructions are deterministic across URLs modulo the substituted URL", async () => {
  // Two different URLs should produce identical instructions once you
  // strip out the URL substitution. Guards against accidental URL-derived
  // logic creeping into the endpoint.
  const a = "https://example.com";
  const b = "https://other.example";
  const resA = await GET(makeRequest({ url: a }));
  const resB = await GET(makeRequest({ url: b }));
  const bodyA = (await resA.json()) as { instructions: string };
  const bodyB = (await resB.json()) as { instructions: string };
  const strip = (s: string) =>
    s.replaceAll(a, "<URL>").replaceAll(b, "<URL>");
  assert.equal(strip(bodyA.instructions), strip(bodyB.instructions));
});

test("required_fields_schema includes both required and optional fields", async () => {
  const res = await GET(makeRequest({ url: "https://example.com" }));
  const body = (await res.json()) as {
    required_fields_schema: {
      required: string[];
      properties: Record<string, unknown>;
    };
  };
  // 6 required + 11 optional = 17 properties total
  assert.equal(Object.keys(body.required_fields_schema.properties).length, 17);
  assert.equal(body.required_fields_schema.required.length, 6);
});
