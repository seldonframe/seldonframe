# Seldon Brain v1 — Event Collection and Wiki Compilation Spec

Version: v1 (April 10, 2026)

This document defines the locked Seldon Brain v1 architecture for a Karpathy-inspired wiki knowledge graph (no vector DB) built from anonymized workspace events.

## Core Model

- Raw events are written to Postgres (`brain_events`) with anonymization at write time.
- Daily compiler runs at `02:00 UTC` and writes markdown knowledge artifacts to filesystem:
  - `/brain/wiki/workspaces/{hashed_id}/summary.md`
  - `/brain/wiki/workspaces/{hashed_id}/{YYYY-MM}.md`
- Compiler run metadata is stored in `brain_compilation_runs`.

## Event Envelope

```json
{
  "event_id": "uuid",
  "workspace_id": "sha256(workspace_uuid)",
  "timestamp": "ISO 8601",
  "event_type": "workspace_created | pipeline_stage_advanced | form_submitted | booking_created | booking_completed | payment_received | custom_block_applied | seldon_it_applied",
  "payload": {},
  "anonymized": true
}
```

## Anonymization Rules

- Email-like fields are SHA-256 hashed.
- Name-like fields are replaced with `CLIENT-[hash]`.
- Free-text fields are summarized to a bounded representation (max 140 chars + metadata).
- No IP addresses or device fingerprints are persisted in Brain event payloads.

## Scheduling

- Compiler trigger route: `/api/cron/brain-compile`
- Deployment scheduler: `packages/crm/vercel.json`
- Cron expression: `0 2 * * *` (daily at 2 AM UTC)
- Route is protected by `CRON_SECRET` headers.

## Compiler Policy

- Default compilation model: Haiku (`claude-3-5-haiku-latest`, configurable via `BRAIN_COMPILER_MODEL`).
- Recompile only workspaces with new events since last successful run.
- Update workspace wiki files incrementally to compound a persistent knowledge graph.

## Karpathy Reference

Seldon Brain follows the “raw events -> compiled markdown wiki” pattern from Andrej Karpathy’s April 2026 LLM wiki approach, using markdown links and folder structure as the primary graph substrate.

## Operational Notes

- Layer 1 intelligence can run directly on workspace events from day 1.
- Layer 2 comparative intelligence compounds as daily wiki compilations accumulate.
- Brain data is internal-only and never exposed via public unauthenticated routes.
