// /docs/mcp-servers — curated MCP directory for SMB operators.
// claude/mcp-discovery — C2: page renders MCP_SERVERS grouped by
// MCP_CATEGORIES. Source of truth lives in mcp-servers-data.ts so
// the README and other surfaces can link the live page.

import type { Metadata } from "next";
import { MarketingShell } from "../../marketing-shell";
import {
  MCP_CATEGORIES,
  MCP_SERVERS,
  type McpServer,
  type McpStatus,
} from "./mcp-servers-data";

export const metadata: Metadata = {
  title: "MCP Servers for SMB Operators — SeldonFrame",
  description:
    "Curated, web-verified directory of Model Context Protocol servers for SMB operators building Business OS workflows on SeldonFrame.",
};

const STATUS_LABEL: Record<McpStatus, string> = {
  verified: "Verified",
  community: "Community",
  experimental: "Experimental",
};

const STATUS_CLS: Record<McpStatus, string> = {
  verified:
    "bg-[#1FAE85]/12 text-[#1FAE85] border-[#1FAE85]/30",
  community:
    "bg-[#a1a1aa]/10 text-[#d4d4d8] border-white/10",
  experimental:
    "bg-[#f59e0b]/10 text-[#fbbf24] border-[#fbbf24]/30",
};

const StatusBadge = ({ status }: { status: McpStatus }) => (
  <span
    className={`inline-flex items-center rounded-full border px-[10px] py-[2px] text-[10px] font-mono uppercase tracking-[0.12em] ${STATUS_CLS[status]}`}
  >
    {STATUS_LABEL[status]}
  </span>
);

const ServerCard = ({ server }: { server: McpServer }) => (
  <div className="bg-[#111113] border border-white/5 rounded-[12px] p-5 md:p-6 hover:border-white/10 transition-colors">
    <div className="flex items-start justify-between gap-3 mb-2">
      <a
        href={server.repo}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[15px] font-semibold text-[#fafafa] hover:text-[#1FAE85] transition-colors"
      >
        {server.name}
      </a>
      <StatusBadge status={server.status} />
    </div>
    <p className="text-[13px] text-[#a1a1aa] leading-[1.6] mb-3">{server.description}</p>
    <p className="text-[13px] text-[#d4d4d8] leading-[1.65] mb-4">
      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#1FAE85] block mb-1">
        Use case
      </span>
      {server.useCase}
    </p>
    <dl className="grid grid-cols-1 sm:grid-cols-[80px,1fr] gap-x-4 gap-y-1 text-[12px] mb-3">
      <dt className="text-[#71717a] font-mono uppercase tracking-[0.12em]">Transport</dt>
      <dd className="text-[#d4d4d8] font-mono">{server.transport}</dd>
      <dt className="text-[#71717a] font-mono uppercase tracking-[0.12em]">Auth</dt>
      <dd className="text-[#d4d4d8]">{server.auth}</dd>
    </dl>
    {server.notes ? (
      <p className="text-[12px] text-[#71717a] leading-[1.6] border-t border-white/5 pt-3 mt-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#a1a1aa]/80 mr-2">Note</span>
        {server.notes}
      </p>
    ) : null}
  </div>
);

export default function McpServersPage() {
  const verifiedCount = MCP_SERVERS.filter((s) => s.status === "verified").length;
  const communityCount = MCP_SERVERS.filter((s) => s.status === "community").length;
  const experimentalCount = MCP_SERVERS.filter((s) => s.status === "experimental").length;

  return (
    <MarketingShell>
      <article className="max-w-[1140px] mx-auto px-5 md:px-12 py-12 md:py-20">
        {/* Hero */}
        <header className="mb-12 max-w-[760px]">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-2">
            Docs · MCP Servers
          </p>
          <h1 className="text-[clamp(30px,4vw,42px)] font-bold tracking-[-0.03em] text-[#fafafa] mb-4 leading-[1.15]">
            MCP Servers for SMB Operators
          </h1>
          <p className="text-[16px] text-[#a1a1aa] leading-[1.7] mb-3">
            Curated list of Model Context Protocol servers that work with SeldonFrame.
            Connect external tools to your Business OS via MCP and let agents drive them
            from natural language.
          </p>
          <p className="text-[14px] text-[#71717a] leading-[1.7]">
            New to MCP?{" "}
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1FAE85] hover:underline"
            >
              modelcontextprotocol.io
            </a>{" "}
            has the protocol spec. Each server below is web-verified — no abandoned or
            broken entries.
          </p>
        </header>

        {/* Status legend + counts */}
        <div className="flex flex-wrap items-center gap-3 mb-12 pb-8 border-b border-white/5">
          <span className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mr-2">
            Legend
          </span>
          <div className="flex items-center gap-2">
            <StatusBadge status="verified" />
            <span className="text-[12px] text-[#a1a1aa]">
              official + actively maintained ({verifiedCount})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status="community" />
            <span className="text-[12px] text-[#a1a1aa]">
              real, community-maintained ({communityCount})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status="experimental" />
            <span className="text-[12px] text-[#a1a1aa]">
              early preview ({experimentalCount})
            </span>
          </div>
        </div>

        {/* Category sections */}
        <div className="space-y-16">
          {MCP_CATEGORIES.map((category) => {
            const servers = MCP_SERVERS.filter((s) => s.category === category.id);
            if (servers.length === 0) return null;
            return (
              <section key={category.id} id={category.id}>
                <div className="mb-6">
                  <h2 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] text-[#fafafa] mb-2">
                    {category.title}
                  </h2>
                  <p className="text-[14px] text-[#a1a1aa] max-w-[680px] leading-[1.65]">
                    {category.blurb}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {servers.map((server) => (
                    <ServerCard key={server.name} server={server} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Next steps */}
        <section className="mt-20 bg-[#111113] border border-white/5 rounded-[12px] p-6 md:p-8">
          <h2 className="text-[16px] font-semibold mb-3 text-[#fafafa]">What&apos;s next</h2>
          <ul className="space-y-2 text-[14px]">
            <li>
              <a href="/docs/quickstart" className="text-[#1FAE85] hover:underline">
                Install SeldonFrame &rarr;
              </a>
              <span className="text-[#71717a]">
                {" "}
                — three-command MCP install + first workspace
              </span>
            </li>
            <li>
              <a href="/docs" className="text-[#1FAE85] hover:underline">
                Read the SeldonFrame docs &rarr;
              </a>
              <span className="text-[#71717a]">
                {" "}
                — primitives, API surface, archetype patterns
              </span>
            </li>
            <li>
              <a
                href="https://github.com/seldonframe/seldonframe"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1FAE85] hover:underline"
              >
                Star the repo &rarr;
              </a>
              <span className="text-[#71717a]"> — open source under MIT</span>
            </li>
          </ul>
        </section>

        {/* Disclaimer */}
        <p className="mt-10 text-[12px] text-[#3f3f46] text-center leading-[1.6]">
          Last verification pass: 2026-04-26. MCP server projects move fast — if you find a
          broken entry,{" "}
          <a
            href="https://github.com/seldonframe/seldonframe/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#71717a] hover:text-[#a1a1aa] underline decoration-white/10 underline-offset-4"
          >
            open an issue
          </a>
          .
        </p>
      </article>
    </MarketingShell>
  );
}
