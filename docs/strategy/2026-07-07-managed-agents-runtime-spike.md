# Spike: SeldonFrame deployed agents on Anthropic Managed Agents (2026-07-07)

Status: SPIKE DOC — worth a 2–3 day investigation, NOT a build commitment.
Trigger: the Managed Agents multi-agent sessions API (beta
`managed-agents-2026-04-01`) maps almost 1:1 onto primitives we hand-built.

## 1. The mapping (why this is worth a spike at all)

| Managed Agents concept | SeldonFrame equivalent we hand-built |
|---|---|
| Agent definition (model, system, tools, MCP servers, skills) | `agent_templates` + blueprint + SKILL.md (the 6 primitives) |
| Agent version pinning (roster pins a version) | template=product / deployment=tenant-config split (migration 0033) |
| Session | a deployment (one client's live agent instance) |
| Session thread (persistent, isolated context) | a conversation (`agentTurns` history reload in `executeTurn`) |
| Vault credentials (session-scoped, per-MCP-server) | `organizations.integrations` + `deployments.calendar_ref` + per-workspace creds plumbing |
| Agent-scoped MCP servers | per-deployment tool binding (`bindingToCtxBooking`, Composio entity scoping) |
| Coordinator + roster | the fused front-office bundle (receptionist delegating to booking/CRM/review skills) |
| `{"type": "self"}` copies + session-level config overrides | `applyDeploymentPersona` / per-deployment customization |

We spent roughly six weeks of build time on our versions of rows 2–6. Anthropic
now sells rows 1–8 as infrastructure. That is both an opportunity (outsource
the undifferentiated loop) and a threat (the orchestration layer is
commoditizing — our moat must stay the fused front office, evals/trust, and
distribution, per the wedge doc).

## 2. BYOK maps cleanly — the builder's key funds their coordinator

Today: `builder_llm_keys` (ICP-3 Phase 0.2 schema) + BYOK means the builder's
Anthropic key pays for their agents' turns through OUR runtime loop.

On Managed Agents: the builder's key IS the API key that creates their agents,
sessions, and threads. Consequences:
- **COGS stays ≈ 0** (never-taxes preserved) — usage bills straight to the
  builder's Anthropic account; we never proxy or mark up tokens.
- **Rate limits and spend visibility are the builder's own** — kills a whole
  class of "why is my agent slow / what did it cost" support burden.
- **Their agents survive us** — a builder's agent definitions live in their
  Anthropic org. This is "never-goes-stale" + ownership made literal, and a
  marketplace trust story no competitor with a proprietary runtime can tell.

## 3. Vaults solve the agency multi-deploy credential story

Today, agency deploy-to-all-clients re-scopes credentials by hand: per-client
Twilio in `organizations.integrations`, per-deployment Composio entity IDs,
`calendar_ref.ownerOrgId` fallbacks — each was its own bug class (the
`configured:false` trap, the tool-router-mode Composio gotcha, hasLiveSms).

On Managed Agents: **one vault per client org**, holding that client's Google/
calendar/CRM credentials keyed by exact `mcp_server_url`; the deploy flow
creates `session(agent=template@version, vault_ids=[client_vault])`. Credential
scoping becomes a platform guarantee instead of code we maintain — an agent
literally cannot reach another client's credentials because its session never
had them. That is a stronger tenant-isolation claim than our org-scope
discipline, and it's auditable.

## 4. Distribution bonus: SF agents as tools inside OTHER coordinators

Managed agents declare MCP servers per agent definition. Our marketplace rental
rail already exposes agents as MCP endpoints (`/api/v1/agents/[slug]/mcp` +
signed rental key). Any company building on Managed Agents can therefore drop a
rented SeldonFrame agent into their coordinator's roster as just another MCP
server + vault credential. The marketplace becomes distribution INTO the
Anthropic agent ecosystem, not just our own storefront.

## 5. What stays native (the seam design)

- **Voice stays native.** The realtime SIP loop (gpt-realtime + Cedar +
  deterministic tool bridge) needs sub-second turns; Managed Agents sessions
  are not a realtime voice substrate. Voice keeps `executeTurn`-adjacent
  plumbing indefinitely.
- **Chat / SMS / email agents are the candidates** — turn-based, seconds-scale
  latency tolerance, already channel-abstracted via `run-channel-turn.ts`.
- **The seam:** an `AgentRuntime` backend interface at the run-channel-turn
  level — `native | managed-agents`, resolved per deployment, **fail-soft to
  native** — the exact pattern `resolveCalendarBackend` proved for booking
  backends. No big-bang migration; one flag-gated deployment at a time.
- **What we keep regardless:** the Soul, the fused front-office tools, evals +
  validators + vision_check (never-lies is OUR layer — Managed Agents has no
  opinion on truth), the CRM/UI, the marketplace.

## 6. Risks / open questions (the spike answers these)

1. **Beta stability + GA timeline** — `managed-agents-2026-04-01` beta header;
   pricing of sessions/sandboxes beyond token cost?
2. **Latency per turn** for SMS/chat (target: p95 < 3s tool-round-trip).
3. **Eval parity** — same SKILL.md as system prompt, same golden conversations:
   does the managed loop pass our eval gate at the same rate as `executeTurn`?
4. **History semantics** — threads persist server-side; our never-lies fixes
   depend on controlling what enters history (`persist:false` escape hatch).
   Can we replicate "ephemeral retry" semantics? (Interrupt + new thread?)
5. **25-thread/session and depth-1 limits** — fine for 1 session per
   deployment + 1 thread per conversation? Confirm thread archival flow for
   long-lived SMS threads.
6. **Philosophy check:** "thin harness we own" vs "outsource the loop." The
   answer is the seam: we own the CONTRACT (tools, evals, Soul), not
   necessarily the while-loop. If the backend is swappable and fail-soft,
   owning the loop stops being load-bearing.

## 7. Spike plan (2–3 days, zero product risk)

1. Mirror ONE deployed chat agent as a managed agent: same system prompt
   (SKILL.md), SF MCP server declared with a rental-key vault credential.
2. Replay 10 golden conversations through a session thread; run our eval
   grader on the transcripts. Compare vs `executeTurn` on pass rate.
3. Measure: p50/p95 latency per turn, cost per conversation, failure modes.
4. Write the `AgentRuntime` seam design (interface + resolution + fail-soft)
   sized against what the numbers say.
Decision gate to go further: eval parity, p95 < 3s, cost within ~20% of
native, and a believable GA path. Any miss → shelve, keep the doc, re-check
at GA.
