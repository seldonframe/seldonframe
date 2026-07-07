# CLAUDE.md — SeldonFrame Project Constitution

## 1. Locked SeldonFrame Vision (Never Compromise)
- **Thin harness** + **fat BLOCK.md skills** + **owned Brain v2**
- Zero-friction first-run experience:
  - Install MCP → type natural language → instantly get a **real hosted workspace** on `<slug>.app.seldonframe.com`
  - Includes full CRM, Cal.diy booking, Formbricks intake, Brain v2, beautiful dark theme
- No guest mode, no local:// paths, no claim step, no upfront API key
- Progressive key disclosure only: ask for `SELDONFRAME_API_KEY` only when the builder actually needs gated features (2nd workspace, custom domain, full Brain v2, publishing, etc.)
- Builders own their customized blocks and can publish them to the marketplace
- Everything stays connected via the Soul (single source of truth)
- First workspace is free forever. $29/mo flat unlocks unlimited workspaces (supersedes the older $9/extra-workspace line — see §1b)

## 1b. Current Direction Constraints (settled 2026-06-21 — do not re-litigate)
These supersede older notes in §1 where they conflict. Read before any product/build decision so the loop never re-derives them.
- **Positioning:** *never-lies* (reliability — grounded + enforced read-back + guardrails + auto-evals) / *never-taxes* (flat pricing, owned + portable, no lock-in) / *never-goes-stale* (antifragile thin harness rides every model gain). Lead with these; sell on value, never on the $ (anchor "one booked job pays for it").
- **BYOK is plumbing, not the pitch.** It's *how* pricing stays flat (COGS≈0); never the front-door ask — buyers experience key-juggling as the pain.
- **Pricing (finalized):** $29/mo flat · unlimited workspaces · NO trial — charge at checkout, cancel anytime; the free build→claim→use flow IS the trial (14-day trial REMOVED 2026-07-05) · + GMV fee 5→3→2% (only when SF is the sales channel) · + marketplace usage fee. "We don't tax your work." (Supersedes the older "$9/extra workspace" line above and the $19/$49/$297 tiers.)
- **Voice is surface #1, not the product.** SF builds ANY agent on ANY surface (voice · web-chat · SMS · email · DM · MCP-endpoint) from the **6 primitives** (Surface · Skill · Tools · Knowledge/Brain · Guardrails · Voice/Format), bound to the client's tools via MCP/API. Build surface-agnostic.
- **SF is the source of truth that pushes outward** (ICS for calendar; MCP/API for tools) — never a dependent pulling through middleware. **No Zapier/Make.** BYO-OAuth-app (the builder brings their own OAuth app, reused per client) → SF never does Google CASA.
- **Reuse, don't rebuild.** Before building a subsystem, find the existing pipeline and call it (the front-office bridge reused `createFullWorkspace`; the deployed-agent calendar reused the `bookingMode` abstraction). Rebuilding what exists is the #1 avoidable waste.
- **Deliverable = a whitelabel AI front office per client** (agent + CRM + calendar + portal + landing + reviews, agency-branded); the agency operates it + shares a portal.
- **The build loop:** brainstorm → spec → plan → subagent-build → `/verify-build` → merge → memory. **Maker ≠ checker.** Swarm for breadth, gate for depth. **Loop the build; keep the judgment human.** Skills: `.claude/skills/{ship-feature,verify-build}`. Dispatch subagents by the named roster in `.claude/agents/` (scout · implementer · reviewer · vision-grader · verify-runner · smoke-runner) — models are pinned in the agent frontmatter; never pick a model ad hoc.

## 2. Workflow Orchestration Rules

### 2.1 Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don’t keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2.2 Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 2.3 Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project
- **Learning law:** after every non-trivial solved problem, run the `extract-approach` skill (`.claude/skills/extract-approach/`) before moving on — a solution without its learnings note is unfinished work

### 2.4 Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: “Would a staff engineer approve this?”
- Run tests, check logs, demonstrate correctness

### 2.5 Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don’t over-engineer
- Challenge your own work before presenting it

### 2.6 Autonomous Bug Fixing
- When given a bug report: just fix it. Don’t ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

### 2.7 Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## 3. Core Principles (Always Apply)

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what’s necessary. Avoid introducing bugs.
- **Thin Harness + Fat Skills**: Never bloat the core; make blocks rich and forkable.
- **Delight First**: The first 60 seconds must feel magical for a new builder.

### 3.1 Named failure modes — catch yourself, STOP, don't push through
(From Karpathy's *CLAUDE.md field notes*. When you notice one, the right move is to stop, not to power through — same reflex as §2.1's "re-plan immediately.")
- **Optimistic Path** — you handled the happy path and ignored the 500 / null / empty case. A tool that reports success on a write it never verified is this bug (it's what made SeldonChat lie "Done ✅"). **Success must be defined against the observable end-state, not "the code ran."** Reject a missing/malformed input with an explicit error, never a silent pass.
- **Runaway Refactor** — a fix that starts cascading across files. Stop and reduce the blast radius (or split it into its own slice) rather than letting one change metastasize.
- **Kitchen Sink** — restructuring adjacent code "while you're in here." Reinforces **Minimal Impact**: touch only what the task needs.
- **Wrong Abstraction** — abstracting on the first occurrence. Copy-paste twice before you extract; a premature helper is harder to undo than duplication.

## How to Use This File
- Claude Code reads this file automatically at the start of every session.
- Always begin major work with: “Review CLAUDE.md and the current plan in tasks/todo.md”
- Maintain `tasks/todo.md` and `tasks/lessons.md` religiously.

This file is the single source of truth for how we build SeldonFrame.
