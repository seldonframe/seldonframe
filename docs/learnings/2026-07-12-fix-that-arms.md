# The fix that arms: repairing a capability can weaponize a distant consumer

**Problem, one line:** Hours after fixing empty Composio tool allowlists (agents finally got real Gmail tools), "sandboxed" eval runs started sending REAL emails — the eval path's safety had silently depended on the very bug that was fixed (2026-07-11).

## The approach
1. The eval runner ran agents with `testMode: true`, which sandboxes only SF-NATIVE write tools. Connector (Composio/MCP) tools execute for real regardless — a documented, deliberate property of the supervised-run path.
2. That was safe for months ONLY because compiled/generated agents had a bug: their connector bindings carried empty allowlists and resolved to zero tools. Evals never had a real tool to fire.
3. Fixing the allowlist bug (seeding default tools at the authoring sites) armed every eval run with live tools overnight. Nothing in the eval path changed; its safety assumption was invalidated from a distance.
4. Detection came from a platform log line (a Gmail-send SDK warning inside a "Run evals" request) — not from any test, because the tests mocked the connector layer both before and after.
5. Fix: an explicit `sandboxConnectors` flag at the tool-resolution seam, set by the eval adapter, stubbing every wrapped connector executor with a synthetic envelope — making the promise ("nothing is booked or sent") ENFORCED rather than incidental.

## Judgment calls
- Did NOT sandbox connectors globally under `testMode` — the supervised-run path exists precisely to execute real tools; the two paths were split by an explicit flag instead of overloading one.
- Did NOT rely on the second eval entry point being covered by the same flag — verified it separately (it refuses to run when connectors exist, a different but valid guard).
- Shipped the sandbox as a P0 ahead of an in-flight feature wave, interrupting the implementer mid-slice — capability fixes that touch safety assumptions outrank features.

**Reusable rule:** when a fix grants a capability (tools, permissions, data) that previously resolved to nothing, grep every consumer of that capability for safety promises that were only true because the capability was broken — "sandboxed," "read-only," "dry-run" claims are the first suspects.

Related: tasks/lessons.md L-34 (the allowlist class), `docs/learnings/2026-07-12-prod-row-readback-diagnostic.md`.
