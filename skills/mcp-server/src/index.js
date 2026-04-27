#!/usr/bin/env node

// Node version gate — must run before any imports that could fail or
// reach for fetch(). Without this, Node 16 users get a cryptic
// "fetch is not defined" crash the moment the first tool calls the
// SeldonFrame API.
//
// Per L-29 the cleanroom test in GitHub Codespaces (default image
// ships Node v16.20.2 in some configurations) surfaced this
// immediately on @seldonframe/mcp@1.0.0. Strict requirement is
// documented in engines.node = ">=18" and reinforced here at runtime
// so users get actionable next-steps instead of a stack trace.
//
// Implementation note: we use dynamic `await import()` for the SDK
// modules below specifically so this gate runs BEFORE any SDK code
// executes. Static `import` statements at the top of an ESM module
// are hoisted and evaluated before any module-body code, which would
// defeat the gate if the SDK ever started failing at import-time on
// older Node versions.
const [nodeMajor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 18) {
  process.stderr.write(
    `\n  SeldonFrame MCP requires Node.js 18 or later.\n` +
      `  You are running Node.js ${process.versions.node}.\n\n` +
      `  To fix:\n` +
      `    nvm install 18 && nvm use 18\n` +
      `  Or:\n` +
      `    nvm install 20 && nvm use 20\n\n` +
      `  Then retry:\n` +
      `    claude mcp add seldonframe -- npx -y @seldonframe/mcp\n\n`,
  );
  process.exit(1);
}

const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
  "@modelcontextprotocol/sdk/types.js"
);
const { WELCOME_MARKDOWN, VERSION } = await import("./welcome.js");
const { TOOLS, TOOL_MAP } = await import("./tools.js");

const server = new Server(
  { name: "seldonframe", version: VERSION },
  {
    capabilities: { tools: {} },
    instructions: WELCOME_MARKDOWN,
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOL_MAP[req.params.name];
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
    };
  }
  try {
    const result = await tool.handler(req.params.arguments ?? {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
