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
- First workspace is free forever. Additional workspaces = $9/month

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

## How to Use This File
- Claude Code reads this file automatically at the start of every session.
- Always begin major work with: “Review CLAUDE.md and the current plan in tasks/todo.md”
- Maintain `tasks/todo.md` and `tasks/lessons.md` religiously.

This file is the single source of truth for how we build SeldonFrame.
