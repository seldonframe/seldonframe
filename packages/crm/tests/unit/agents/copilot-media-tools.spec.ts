// Copilot media-editing tools (media-editing T3, TDD).
//
// search_media / update_media / delete_media are thin zod wrappers over the
// already-shipped T1/T2 seams (setR1Media, clearR1Media, searchStockPhotos,
// resolveExternalMedia) — DI'd via each tool's own deps param, mirroring
// UpdateThemeDeps/DesignToolsDeps/ModuleToolsDeps in tools.ts (this repo
// prefers DI over node:test mock.module / vi.mock — tsx's CJS interop makes
// module mocking unreliable). No DB, no network.
//
// SECURITY INVARIANT under test: update_media/delete_media's zod schema has
// no orgId-shaped field at all, so the org to write is ALWAYS ctx.orgId —
// a malicious/hallucinated orgId in the model args can only ever be ignored.

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import { buildCopilotTools } from "../../../src/lib/agents/copilot/tools";
import type {
  MediaToolsDeps,
} from "../../../src/lib/agents/copilot/tools";
import type { ToolExecuteContext } from "../../../src/lib/agents/tools";
import type { StockPhoto } from "../../../src/lib/media/stock-search";
import type { ResolveMediaResult } from "../../../src/lib/media/resolve-url";
import type { SetR1MediaResult } from "../../../src/lib/landing/set-r1-media";

function fakeCtx(overrides: Partial<ToolExecuteContext> = {}): ToolExecuteContext {
  return {
    orgId: "org-real-123",
    orgSlug: "acme",
    agentId: "agt-1",
    conversationId: "conv-1",
    testMode: false,
    ...overrides,
  };
}

function fakePhotos(): StockPhoto[] {
  return [
    {
      url: "https://images.unsplash.com/photo-1.jpg",
      thumbUrl: "https://images.unsplash.com/photo-1-thumb.jpg",
      alt: "a plumber at work",
      credit: "Jane Doe",
      source: "unsplash",
    },
    {
      url: "https://images.pexels.com/photo-2.jpg",
      thumbUrl: "https://images.pexels.com/photo-2-thumb.jpg",
      alt: "a wrench",
      credit: "John Smith",
      source: "pexels",
    },
  ];
}

function makeDeps(overrides: Partial<MediaToolsDeps> = {}): MediaToolsDeps {
  return {
    searchStockPhotos: mock.fn(async (_query: string) => fakePhotos()),
    resolveExternalMedia: mock.fn(
      async (_url: string, _kind: "image" | "video"): Promise<ResolveMediaResult> => ({
        ok: true,
        url: "https://blob.example.com/rehosted.jpg",
        contentType: "image/jpeg",
      }),
    ),
    setR1Media: mock.fn(
      async (_orgId: string, input): Promise<SetR1MediaResult> => ({ ok: true, slot: input.slot }),
    ),
    clearR1Media: mock.fn(
      async (_orgId: string, slot: string): Promise<SetR1MediaResult> => ({ ok: true, slot }),
    ),
    ...overrides,
  };
}

function getTool(name: string) {
  const tools = buildCopilotTools();
  const tool = tools.find((t) => t.name === name);
  assert.ok(tool, `${name} tool must exist`);
  return tool!;
}

describe("search_media", () => {
  test("returns candidates from the injected searchStockPhotos, does not write", async () => {
    const tool = getTool("search_media");
    const deps = makeDeps();
    const ctx = fakeCtx();

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )({ query: "plumber at work" }, ctx, deps)) as {
      ok: boolean;
      photos: StockPhoto[];
      target_slot: string;
    };

    assert.equal((deps.searchStockPhotos as ReturnType<typeof mock.fn>).mock.callCount(), 1);
    const [calledQuery] = (deps.searchStockPhotos as ReturnType<typeof mock.fn>).mock.calls[0]!
      .arguments;
    assert.equal(calledQuery, "plumber at work");

    assert.equal(result.ok, true);
    assert.deepEqual(result.photos, fakePhotos());

    // Never writes.
    assert.equal((deps.setR1Media as ReturnType<typeof mock.fn>).mock.callCount(), 0);
    assert.equal((deps.clearR1Media as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });

  test("defaults target_slot to hero_background when not provided", async () => {
    const tool = getTool("search_media");
    const deps = makeDeps();
    const ctx = fakeCtx();

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )({ query: "cozy cafe" }, ctx, deps)) as { target_slot: string };

    assert.equal(result.target_slot, "hero_background");
  });

  test("honors an explicit target_slot hint", async () => {
    const tool = getTool("search_media");
    const deps = makeDeps();
    const ctx = fakeCtx();

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )({ query: "wrench", target_slot: "service_photo:0" }, ctx, deps)) as { target_slot: string };

    assert.equal(result.target_slot, "service_photo:0");
  });

  test("query is required by zod", () => {
    const tool = getTool("search_media");
    const empty = tool.inputSchema.safeParse({});
    assert.equal(empty.success, false);
    const blank = tool.inputSchema.safeParse({ query: "" });
    assert.equal(blank.success, false);
  });
});

describe("update_media", () => {
  test("routes the url through resolveExternalMedia then setR1Media WITH ctx.orgId, ignoring a malicious orgId-shaped arg", async () => {
    const tool = getTool("update_media");
    const deps = makeDeps();
    const ctx = fakeCtx({ orgId: "org-real-123" });

    // No orgId-shaped field in update_media's zod schema at all, so even a
    // maliciously-crafted args object can't redirect the write.
    const maliciousArgs = {
      slot: "hero_background",
      url: "https://example.com/photo.jpg",
      orgId: "attacker-org",
      workspaceId: "attacker-org-2",
    };

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )(maliciousArgs, ctx, deps)) as { ok: boolean };

    const resolveMock = deps.resolveExternalMedia as ReturnType<typeof mock.fn>;
    assert.equal(resolveMock.mock.callCount(), 1);
    const [resolvedUrl, resolvedKind] = resolveMock.mock.calls[0]!.arguments;
    assert.equal(resolvedUrl, "https://example.com/photo.jpg");
    assert.equal(resolvedKind, "image");

    const setMock = deps.setR1Media as ReturnType<typeof mock.fn>;
    assert.equal(setMock.mock.callCount(), 1);
    const [calledOrgId, calledInput] = setMock.mock.calls[0]!.arguments;
    assert.equal(calledOrgId, "org-real-123", "must write to ctx.orgId, not any args-supplied org field");
    assert.notEqual(calledOrgId, "attacker-org");
    assert.notEqual(calledOrgId, "attacker-org-2");
    assert.equal(calledInput.slot, "hero_background");
    assert.equal(calledInput.src, "https://blob.example.com/rehosted.jpg");

    assert.equal(result.ok, true);
  });

  test("on a resolveExternalMedia failure, returns an honest failure and does NOT call setR1Media", async () => {
    const deps = makeDeps({
      resolveExternalMedia: mock.fn(
        async (): Promise<ResolveMediaResult> => ({ ok: false, error: "unsafe_url" }),
      ),
    });
    const tool = getTool("update_media");
    const ctx = fakeCtx();

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )({ slot: "hero_background", url: "http://169.254.169.254/secret" }, ctx, deps)) as {
      ok: boolean;
      error?: string;
    };

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /unsafe_url/);
    assert.equal((deps.setR1Media as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });

  test("kind:video routes to hero_background_video slot handling and passes the pass-through url", async () => {
    const deps = makeDeps({
      resolveExternalMedia: mock.fn(
        async (_url: string, kind: "image" | "video"): Promise<ResolveMediaResult> => {
          assert.equal(kind, "video");
          return { ok: true, url: "https://cdn.example.com/clip.mp4", contentType: "video/mp4" };
        },
      ),
    });
    const tool = getTool("update_media");
    const ctx = fakeCtx();

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )(
      { slot: "hero_background_video", url: "https://example.com/clip.mp4", kind: "video" },
      ctx,
      deps,
    )) as { ok: boolean };

    const setMock = deps.setR1Media as ReturnType<typeof mock.fn>;
    assert.equal(setMock.mock.callCount(), 1);
    const [, calledInput] = setMock.mock.calls[0]!.arguments;
    assert.equal(calledInput.slot, "hero_background_video");
    assert.equal(calledInput.src, "https://cdn.example.com/clip.mp4");
    assert.equal(result.ok, true);
  });

  test("on a setR1Media failure, surfaces the failure honestly", async () => {
    const deps = makeDeps({
      setR1Media: mock.fn(async (): Promise<SetR1MediaResult> => ({ ok: false, error: "no_landing_exists" })),
    });
    const tool = getTool("update_media");
    const ctx = fakeCtx();

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )({ slot: "hero_background", url: "https://example.com/photo.jpg" }, ctx, deps)) as {
      ok: boolean;
      error?: string;
    };

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /no_landing_exists/);
  });

  test("slot and url are required by zod; no orgId-shaped field exists on the schema", () => {
    const tool = getTool("update_media");
    const missingUrl = tool.inputSchema.safeParse({ slot: "hero_background" });
    assert.equal(missingUrl.success, false);
    const missingSlot = tool.inputSchema.safeParse({ url: "https://example.com/x.jpg" });
    assert.equal(missingSlot.success, false);

    const shape = tool.jsonSchema as { properties?: Record<string, unknown> };
    assert.ok(!shape.properties?.orgId, "schema must not expose an orgId field");
    assert.ok(!shape.properties?.workspaceId, "schema must not expose a workspaceId field");

    const ok = tool.inputSchema.safeParse({
      slot: "hero_background",
      url: "https://example.com/x.jpg",
    });
    assert.equal(ok.success, true);
  });
});

describe("delete_media", () => {
  test("calls clearR1Media with ctx.orgId, ignoring a malicious orgId-shaped arg", async () => {
    const tool = getTool("delete_media");
    const deps = makeDeps();
    const ctx = fakeCtx({ orgId: "org-real-123" });

    const maliciousArgs = { slot: "hero_background", orgId: "attacker-org" };

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )(maliciousArgs, ctx, deps)) as { ok: boolean };

    const clearMock = deps.clearR1Media as ReturnType<typeof mock.fn>;
    assert.equal(clearMock.mock.callCount(), 1);
    const [calledOrgId, calledSlot] = clearMock.mock.calls[0]!.arguments;
    assert.equal(calledOrgId, "org-real-123");
    assert.notEqual(calledOrgId, "attacker-org");
    assert.equal(calledSlot, "hero_background");
    assert.equal(result.ok, true);
  });

  test("surfaces a clearR1Media failure honestly", async () => {
    const deps = makeDeps({
      clearR1Media: mock.fn(async (): Promise<SetR1MediaResult> => ({ ok: false, error: "unknown_slot" })),
    });
    const tool = getTool("delete_media");
    const ctx = fakeCtx();

    const result = (await (
      tool.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: MediaToolsDeps,
      ) => Promise<unknown>
    )({ slot: "bogus_slot" }, ctx, deps)) as { ok: boolean; error?: string };

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /unknown_slot/);
  });

  test("slot is required by zod", () => {
    const tool = getTool("delete_media");
    const empty = tool.inputSchema.safeParse({});
    assert.equal(empty.success, false);
    const ok = tool.inputSchema.safeParse({ slot: "hero_image" });
    assert.equal(ok.success, true);
  });
});

describe("buildCopilotTools non-mutating spread", () => {
  test("returns a fresh array on every call", () => {
    const first = buildCopilotTools();
    const second = buildCopilotTools();
    assert.notEqual(first, second, "must return a new array instance each call");
    first.push({} as never);
    assert.equal(second.length, second.filter((t) => t).length);
    assert.notEqual(first.length, second.length);
  });
});
