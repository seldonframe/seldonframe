// v1.6.0 — POST /api/v1/brain
//
// Single REST endpoint for brain CRUD. Operations dispatched on `op` in
// the body so the IDE agent makes one MCP call per brain interaction.
// Workspace-scoped — every operation requires a workspace bearer token,
// and every read/write is scoped to the bearer's org. Layer-2 (global)
// reads are public-by-design but still require bearer for rate limiting.
//
// Body shape:
//   { op: "read", path: "voice/copy-that-works.md" }
//   { op: "list", prefix?: "voice/" }
//   { op: "write", path: "...", body: "...", metadata?: {...} }
//   { op: "append", path: "...", paragraph: "...", metadata?: {...} }
//   { op: "delete", path: "..." }
//   { op: "list_patterns", vertical?: "barbershop" }  (layer-2 read)

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  appendToBrainNote,
  deleteBrainNote,
  listBrainDir,
  readBrainNote,
  writeBrainNote,
} from "@/lib/brain/store";
import type { BrainNoteMetadata } from "@/db/schema/brain-notes";

type BrainOp = "read" | "list" | "write" | "append" | "delete" | "list_patterns";

type Body = {
  op?: unknown;
  path?: unknown;
  prefix?: unknown;
  body?: unknown;
  paragraph?: unknown;
  metadata?: unknown;
  vertical?: unknown;
  block_type?: unknown;
};

function isValidPath(path: string): boolean {
  // Allow alphanumeric, dashes, underscores, slashes, dots. Reject path
  // traversal attempts (..) and absolute paths.
  if (!path || path.length > 200) return false;
  if (path.startsWith("/") || path.startsWith(".")) return false;
  if (path.includes("..")) return false;
  return /^[a-z0-9_./\-]+$/i.test(path);
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const op = typeof body.op === "string" ? (body.op as BrainOp) : null;
  if (!op) {
    return NextResponse.json(
      { ok: false, error: "missing_op", allowed: ["read", "list", "write", "append", "delete", "list_patterns"] },
      { status: 400 },
    );
  }

  try {
    switch (op) {
      case "read": {
        const path = typeof body.path === "string" ? body.path : "";
        if (!isValidPath(path)) {
          return NextResponse.json(
            { ok: false, error: "invalid_path" },
            { status: 400 },
          );
        }
        const note = await readBrainNote({
          orgId: guard.orgId,
          scope: "workspace",
          path,
        });
        if (!note) {
          return NextResponse.json(
            { ok: true, note: null },
            { status: 200 },
          );
        }
        logEvent(
          "brain_note_read",
          { path, confidence: note.confidence, uses: note.uses },
          { request, orgId: guard.orgId, status: 200 },
        );
        return NextResponse.json({ ok: true, note });
      }

      case "list": {
        const prefix =
          typeof body.prefix === "string" ? body.prefix : undefined;
        if (prefix !== undefined && !isValidPath(prefix)) {
          return NextResponse.json(
            { ok: false, error: "invalid_prefix" },
            { status: 400 },
          );
        }
        const notes = await listBrainDir({
          orgId: guard.orgId,
          scope: "workspace",
          prefix,
        });
        return NextResponse.json({ ok: true, notes });
      }

      case "write": {
        const path = typeof body.path === "string" ? body.path : "";
        const noteBody = typeof body.body === "string" ? body.body : "";
        if (!isValidPath(path) || !noteBody.trim()) {
          return NextResponse.json(
            { ok: false, error: "invalid_path_or_body" },
            { status: 400 },
          );
        }
        const metadata = (body.metadata && typeof body.metadata === "object"
          ? body.metadata
          : {}) as BrainNoteMetadata;
        const note = await writeBrainNote({
          orgId: guard.orgId,
          scope: "workspace",
          path,
          body: noteBody,
          metadata,
        });
        logEvent(
          "brain_note_written",
          { path, body_length: noteBody.length, source: metadata.source ?? "operator" },
          { request, orgId: guard.orgId, status: 200 },
        );
        return NextResponse.json({ ok: true, note });
      }

      case "append": {
        const path = typeof body.path === "string" ? body.path : "";
        const paragraph =
          typeof body.paragraph === "string" ? body.paragraph : "";
        if (!isValidPath(path) || !paragraph.trim()) {
          return NextResponse.json(
            { ok: false, error: "invalid_path_or_paragraph" },
            { status: 400 },
          );
        }
        const metadata = (body.metadata && typeof body.metadata === "object"
          ? body.metadata
          : {}) as BrainNoteMetadata;
        const note = await appendToBrainNote({
          orgId: guard.orgId,
          scope: "workspace",
          path,
          paragraph,
          metadata,
        });
        return NextResponse.json({ ok: true, note });
      }

      case "delete": {
        const path = typeof body.path === "string" ? body.path : "";
        if (!isValidPath(path)) {
          return NextResponse.json(
            { ok: false, error: "invalid_path" },
            { status: 400 },
          );
        }
        const deleted = await deleteBrainNote({
          orgId: guard.orgId,
          scope: "workspace",
          path,
        });
        return NextResponse.json({ ok: true, deleted });
      }

      case "list_patterns": {
        // Layer-2 read: global cross-workspace patterns. Filter by
        // vertical / block_type when provided.
        const vertical =
          typeof body.vertical === "string" ? body.vertical : undefined;
        const blockType =
          typeof body.block_type === "string" ? body.block_type : undefined;
        let prefix = "patterns/";
        if (vertical) prefix = `patterns/by-vertical/${vertical}`;
        else if (blockType) prefix = `patterns/by-block-type/${blockType}`;
        const notes = await listBrainDir({
          orgId: null,
          scope: "global",
          prefix,
        });
        return NextResponse.json({ ok: true, notes });
      }

      default:
        return NextResponse.json(
          { ok: false, error: "unknown_op", op },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent(
      "brain_op_failed",
      { op, error: message },
      { request, orgId: guard.orgId, status: 500, severity: "error" },
    );
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 },
    );
  }
}
