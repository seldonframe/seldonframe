# Example archetypes using external MCP servers

These are **illustrative specs**, not registered archetypes. They show how an external MCP server (from the [/docs/mcp-servers](https://seldonframe.com/docs/mcp-servers) directory) would be wired into a SeldonFrame archetype.

The JSON files in this directory follow the same shape as `packages/crm/src/lib/agents/archetypes/*.ts`'s `specTemplate` field, but with `mcp_tool_call` steps that target tools exposed by external MCP servers. Tool names are namespaced as `<server>.<tool>` for clarity — your actual MCP client will resolve them per its own registry conventions.

## Files

| File | What it shows |
| --- | --- |
| [`postiz-weekly-recap.json`](postiz-weekly-recap.json) | Scheduled trigger → read workspace activity → LLM-generated recap post → publish to Postiz |
| [`google-business-review-request.json`](google-business-review-request.json) | Service-call completion → wait → satisfaction SMS → branch on rating → conditional Google Business review prompt |

## Why these aren't implemented

Wiring SeldonFrame's MCP-client to actually invoke external MCP servers from `mcp_tool_call` steps is post-launch work (v1.1+). Today, `mcp_tool_call` resolves to SeldonFrame's first-party block tools (`send_sms`, `send_email`, `create_contact`, etc.).

These specs exist to illustrate the **shape** of MCP-extended workflows for operators evaluating the platform. When external-MCP routing ships, archetypes following this shape will work without modification.

## Build your own

Pair the [MCP server directory](https://seldonframe.com/docs/mcp-servers) with the [archetype patterns](../../../packages/crm/src/lib/agents/archetypes/) to design your own. File issues if a server you need isn't listed.
