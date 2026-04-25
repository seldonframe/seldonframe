# SeldonFrame vs LangGraph and CrewAI — qualitative framing

**SLICE 9 PR 2 C10 — comparison framing for prospects + press, ~600 words.**

---

## TL;DR

LangGraph and CrewAI are libraries for AI engineers building agent
workflows in Python. SeldonFrame is an Operating System for the
small business itself — the workflows ship installed, the chat
surface configures them, and the runtime is deterministic.

If you have an AI team and want to build a custom agent, use
LangGraph. If you have a business and want to run it, use SeldonFrame.

---

## What each one actually is

**LangGraph** (LangChain): a Python library for building stateful,
multi-step LLM workflows as graphs. You write Python. You define
nodes. You decide where the LLM calls happen. You deploy it. You
maintain it. Every workflow you build is *your* code, in *your*
runtime, and the LLM is invoked at every meaningful decision point.

**CrewAI**: a Python framework for orchestrating teams of role-based
agents that delegate to each other ("the Researcher agent talks to
the Writer agent"). Same shape — you write Python, you define
agents, you wire up the runtime, you pay per-call LLM costs at every
hop.

**SeldonFrame**: an Operating System with the workflows already
written. You don't define agents. You don't write Python. You open
a chat window, describe your business, and the OS installs the
relevant blocks (CRM, booking, payments, SMS) and connects the
pre-built archetype workflows (lead-response, follow-up, emergency
triage, vertical-specific automations) into a working business
back-office.

---

## Where each one is the right answer

| You are... | Use... | Why |
|---|---|---|
| An AI engineer at a tech company | LangGraph | Maximum control. You want to write the graph. |
| A research team building agentic workflows | CrewAI | Role abstraction maps cleanly onto multi-agent research. |
| A small business that needs a CRM, booking, and follow-ups | SeldonFrame | The workflows already exist. You install, configure in chat, ship. |
| An ops team that wants typed primitives + chat config | SeldonFrame | The OS surface, not the library surface. |
| Anyone who needs a metered LLM bill at every workflow step | LangGraph / CrewAI | Their model. Not ours. |

---

## The architectural difference

LangGraph and CrewAI both invoke an LLM at most decision points. The
LLM **is** the workflow runtime. That's the design. It's powerful
for novel reasoning, expensive at scale, and unpredictable in cost.

SeldonFrame inverts that: **LLMs build the workflow once, then
deterministic primitives run it forever.** A heat-advisory archetype
that texts vulnerable customers when the forecast hits 110°F is
made of `schedule + external_state branch + mcp_tool_call +
predicate branch + write_state` primitives. Zero model calls at
runtime. The LLM showed up exactly once — when the operator typed
"set up a heat advisory" in chat and the OS authored the workflow.

This isn't a value judgment. It's a fit judgment.
- LangGraph/CrewAI cost scales linearly with workflow execution.
- SeldonFrame cost scales linearly with workflow *authoring* — and
  authoring is a one-time event for most archetypes.

For a 14-tech HVAC contractor running 50 workflow executions a day,
SeldonFrame's cost is the workspace fee + SMS pass-through. For a
research team running 50 multi-step agent reasoning chains a day,
LangGraph/CrewAI's metered-LLM model is correctly priced for what
they're getting.

---

## What's not in this comparison

- **Performance benchmarks.** Different jobs; benchmarking them
  head-to-head would be apples-to-something-not-an-apple.
- **Feature checkboxes.** SeldonFrame has booking, CRM, payments,
  SMS, intake forms, weather, and growing. LangGraph has a graph
  primitive. The lists don't compare cleanly because the products
  aren't trying to be the same product.
- **Open vs closed.** SeldonFrame's runtime + archetype set is
  open and the architecture is documented. The hosted workspace is
  what you pay for. Comparing license posture to LangChain's OSS
  posture would distract from the actual fit question.

---

## When prospects ask "why not just LangGraph?"

The honest answer is: because LangGraph is a library and what you
want is a back-office. You'd spend three months building the
booking + CRM + payment + SMS scaffolding LangGraph doesn't ship
with, then another three building the workflows, then forever
maintaining the LLM cost ladder. SeldonFrame ships installed.
Type five lines in chat, run a business.

If you want the library experience because you're building
something LangGraph is correctly shaped for — a custom multi-agent
reasoning system, a research workflow, a one-off internal automation
where the team has Python skills — go use LangGraph. We mean that.

The two products serve different humans.
