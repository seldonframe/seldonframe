---
name: block-creation
description: Scaffold a new SeldonFrame block from a natural-language intent. Use when the builder says "build me a block that ...", "scaffold a block that ...", or similar. Produces a real, validated block skeleton in packages/crm/src/blocks/ — BLOCK.md with composition contract, tools.ts with Zod schemas, subscription handler stubs (when reactive), and test.todo stubs per tool. Does NOT commit, does NOT install into any workspace. Builder owns review + git.
---

# block-creation — Skill instructions

## When to invoke

Invoke this skill when the builder expresses intent to create a new
block. Trigger phrases include:

- "build me a block that ..."
- "scaffold a block for ..."
- "create a new block named ..."
- "I need a block that does ..."

Do NOT invoke when the builder is asking to:

- Install an existing block into a workspace (that's the SeldonFrame
  MCP's `install_*` tools).
- Modify an existing block (refer to direct file edits).
- Generate UI components or pages (out-of-scope for this slice;
  future SLICE 4 scope).

## Framing — this is code-authoring, not workspace-admin

The scaffold writes files to the builder's repo working tree. It
does NOT:

- commit to git
- push to a remote
- install the block into a running workspace
- modify any workspace's database

Those are the builder's follow-up actions (`git add` / `git commit` /
`git push`, then `install_block` against a workspace). Claude Code
is a code-gen assistant here, not a platform admin.

## Workflow

### 1. Intent → BlockSpec

Claude Code reads the builder's natural-language intent and
constructs a `BlockSpec` JSON object matching the shape below.

**Before constructing the spec, Claude should Read:**

1. Reference anatomies — the composition-contract shape of two
   existing blocks. These show the canonical layout for produces /
   consumes / tools / subscriptions:
   - `packages/crm/src/blocks/notes.block.md` (simple tool-only
     block — the PR 1 C7 smoke-test)
   - `packages/crm/src/blocks/crm.block.md` (real-world anatomy
     with `## Subscriptions` declaring a reactive handler)
2. Canonical NL → BlockSpec examples (these are hand-curated
   translation lessons in code form):
   - `packages/crm/src/lib/scaffolding/nl/example-specs.ts` —
     EXAMPLE_SPECS export. Two examples: tool-only (contact-notes)
     + reactive-with-subscription (auto-activity-log).
3. Hard constraints on BlockSpec shape (the schema Claude must
   honor):
   - `packages/crm/src/lib/scaffolding/spec.ts` — BlockSpecSchema
     + field patterns (slug, tool name, handler name, event name,
     subscription event).

Reading order: anatomies first → schema → examples. Each reads in
under 30 seconds; together they give Claude the concrete pattern
needed to translate NL confidently.

**Required fields:**
- `slug`: kebab-case lowercase, e.g. `"notes"`, `"client-satisfaction"`. Cannot collide with reserved core blocks: `crm`, `caldiy-booking`, `email`, `sms`, `payments`, `formbricks-intake`, `landing-pages`.
- `title`: human-readable title, e.g. `"Notes"`, `"Client Satisfaction"`.
- `description`: one-line builder-facing description.
- `triggerPhrases`: 2-5 natural-language phrases that would activate this block.
- `frameworks`: array of framework strings, e.g. `["universal"]`.

**Optional fields (defaulted if absent):**
- `produces`: array of `{ name, fields }` event declarations.
- `consumes`: array of `{ kind, ... }` discriminated-union entries (`kind: "event" | "soul_field" | "trigger_payload"`).
- `tools`: array of tool definitions: `{ name, description, args: [...], returns: [...], emits: [...] }`.
- `subscriptions`: array of `{ event, handlerName, description, idempotencyKey }` reactive handlers. `event` is fully-qualified: `"<source-block>:<event.name>"`.

### 2. Clarify rarely (three-tier policy per audit G-4)

- **Tier 1 — Ask once** only when the intent is genuinely meaningless
  (zero description, or internally contradictory type declarations).
  Ask ONE focused question; proceed.
- **Tier 2 — Default with TODO markers** for everything else. When
  the intent doesn't name tools, scaffold `create_<entity>` /
  `list_<entity>s` / `get_<entity>` as defaults. Every scaffolded
  default lands with `TODO (scaffold-default)` markers the builder
  can grep.
- **Tier 3 — Fail on dangerous output.** Refuse to scaffold:
  - Destructive tools without explicit confirmation.
  - Modifications to existing blocks (scope limits to NEW blocks).

### 3. Run the scaffold

Once the BlockSpec is constructed, write it to a temporary file and
invoke the scaffold CLI:

```bash
# Claude writes /tmp/spec.json with the BlockSpec JSON
pnpm scaffold:block --spec /tmp/spec.json
```

The scaffold will:

1. Validate the BlockSpec against the Zod schema.
2. Render BLOCK.md, tools.ts, subscription handler stubs (if any), and test stubs.
3. Write all files to `packages/crm/src/blocks/<slug>.*` and `packages/crm/tests/unit/blocks/<slug>.spec.ts`.
4. Run the validation gate:
   - `parseBlockMd` round-trip on the new BLOCK.md
   - `tsc --noEmit` across the CRM package
   - `pnpm emit:blocks:check` (after the builder adds the block to the emit TARGETS registry on next step)
5. On success, print the created-files list and next-step hints.
6. On failure, print the orphan report with `git clean` recovery commands.

### 4. Relay results

After the scaffold succeeds, tell the builder:

- Files created (from the scaffold's stdout).
- Next-step checklist (also from the scaffold's stdout):
  1. Review TODO (scaffold-default) markers — they're the fill-in points.
  2. Add the block to `scripts/emit-block-tools.impl.ts` TARGETS list so emit:blocks:check covers it.
  3. Run `pnpm emit:blocks` to populate the TOOLS block in the BLOCK.md.
  4. Run `pnpm test:unit` — new test stubs appear as todos.
  5. `git diff` / `git add` / `git commit` when satisfied.

On failure, relay the orphan report verbatim so the builder has the
exact recovery commands.

## BlockSpec example — "notes" block

```json
{
  "slug": "notes",
  "title": "Notes",
  "description": "Simple note-taking on contacts.",
  "triggerPhrases": [
    "Add a notes block",
    "Install notes",
    "Let me jot notes on contacts"
  ],
  "frameworks": ["universal"],
  "produces": [
    {
      "name": "note.created",
      "fields": [
        { "name": "noteId", "type": "string", "nullable": false },
        { "name": "contactId", "type": "string", "nullable": false }
      ]
    }
  ],
  "consumes": [],
  "tools": [
    {
      "name": "create_note",
      "description": "Create a note on a contact.",
      "args": [
        { "name": "contactId", "type": "string", "nullable": false, "required": true },
        { "name": "body", "type": "string", "nullable": false, "required": true }
      ],
      "returns": [
        { "name": "noteId", "type": "string", "nullable": false, "required": true }
      ],
      "emits": ["note.created"]
    }
  ],
  "subscriptions": []
}
```

## Dry-run mode

Pass `--dry-run` to see what would be created without writing:

```bash
pnpm scaffold:block --spec /tmp/spec.json --dry-run
```

Useful for previewing before committing to the scaffold.

## Error recovery

If the scaffold fails mid-pipeline:

- Files that landed before the failure remain on disk (by design —
  orphan detection, not transactional rollback).
- The error message lists every orphan + concrete `git clean`
  commands to remove them.
- Fix the underlying issue and re-run. The scaffold refuses to
  overwrite existing files, so the builder must remove orphans
  first (or pick a different slug).

## Out of scope for this skill

- NL intent parsing without an explicit BlockSpec construction step
  (future PR will layer this on; this PR requires Claude Code to
  translate intent → BlockSpec JSON inline).
- UI scaffolding (pages, Puck components) — future SLICE 4.
- Database schema generation (builder authors Drizzle schemas
  manually if their block needs persistence).
- Marketplace publishing (out of slice).
