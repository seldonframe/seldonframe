// /docs/quickstart — the "Start for $0" CTA destination.
// Workstream 2 — three-command install flow + prerequisites + next-steps.

import type { Metadata } from "next";
import { MarketingShell } from "../../marketing-shell";

export const metadata: Metadata = {
  title: "Quickstart — SeldonFrame",
  description:
    "Three commands to install SeldonFrame, create your first workspace, and scaffold your first block.",
};

const Section = ({
  number,
  title,
  body,
  code,
}: {
  number: number;
  title: string;
  body: string;
  code: string;
}) => (
  <div className="bg-[#111113] border border-white/5 rounded-[12px] p-6 md:p-8 relative overflow-hidden">
    <span className="absolute top-3 right-4 text-[44px] font-extrabold text-[#1FAE85] opacity-15 tracking-[-0.04em] leading-none">
      {number}
    </span>
    <h3 className="text-[16px] font-semibold mb-2 text-[#fafafa] relative z-10">{title}</h3>
    <p className="text-[14px] text-[#a1a1aa] leading-[1.65] mb-3 relative z-10">{body}</p>
    <code className="block p-3 bg-[#1a1a1e] rounded-[8px] font-mono text-[12px] text-[#1FAE85] overflow-x-auto leading-[1.5] relative z-10">
      {code}
    </code>
  </div>
);

export default function QuickstartPage() {
  return (
    <MarketingShell>
      <article className="max-w-[760px] mx-auto px-5 md:px-12 py-12 md:py-20">
        <header className="mb-10">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-2">Docs · Quickstart</p>
          <h1 className="text-[clamp(30px,4vw,42px)] font-bold tracking-[-0.03em] text-[#fafafa] mb-4 leading-[1.15]">
            Three commands. Six minutes. A working Business OS.
          </h1>
          <p className="text-[16px] text-[#a1a1aa] leading-[1.7]">
            SeldonFrame installs as an MCP server you wire into your IDE. After three
            commands you have a branded workspace with a CRM, scaffolded blocks, and
            agent flows — all controllable from natural language.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-[18px] font-semibold mb-4 text-[#fafafa]">Prerequisites</h2>
          <ul className="space-y-2 text-[14px] text-[#a1a1aa]">
            <li className="flex items-start gap-2">
              <span className="text-[#1FAE85] text-[12px] font-bold mt-[3px] shrink-0">✓</span>
              <span>
                <a
                  href="https://docs.claude.com/en/docs/claude-code/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#fafafa] underline decoration-white/20 underline-offset-4 hover:decoration-white/60"
                >
                  Claude Code
                </a> installed and authenticated
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#1FAE85] text-[12px] font-bold mt-[3px] shrink-0">✓</span>
              <span>Node.js 18 or newer (Node 20 recommended)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#1FAE85] text-[12px] font-bold mt-[3px] shrink-0">✓</span>
              <span>An Anthropic API key (BYO — SeldonFrame doesn&apos;t margin on tokens)</span>
            </li>
          </ul>
        </section>

        {/*
          Codespaces / WSL / SSH-remote callout. Surfaces friction
          surfaced by the L-29 cleanroom test (Findings #1, #2, #3, #8
          in the pre-launch test protocol). Better to warn users
          upfront than have them discover the gotchas mid-install.
        */}
        <section className="mb-10 bg-[#111113] border border-[#fbbf24]/20 rounded-[12px] p-5 md:p-6">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#fbbf24] font-mono mb-3">
            Running in Codespaces, WSL, or SSH remote?
          </p>
          <ul className="space-y-2 text-[13px] text-[#a1a1aa] leading-[1.65]">
            <li className="flex items-start gap-2">
              <span className="text-[#a1a1aa] mt-[2px] shrink-0">·</span>
              <span>
                <strong className="text-[#d4d4d8]">Node version:</strong> Codespaces default
                images sometimes ship Node 16. SeldonFrame requires Node 18+. Run{" "}
                <code className="font-mono text-[#1FAE85]">nvm install 20 &amp;&amp; nvm use 20</code>{" "}
                if{" "}
                <code className="font-mono text-[#1FAE85]">node --version</code> shows v16 or v17.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#a1a1aa] mt-[2px] shrink-0">·</span>
              <span>
                <strong className="text-[#d4d4d8]">Claude Code OAuth:</strong> the OAuth callback
                points at <code className="font-mono text-[#1FAE85]">localhost</code>, which
                your local browser can&apos;t reach when Claude Code runs in a remote VM. Use
                the API key path instead:{" "}
                <code className="font-mono text-[#1FAE85]">export ANTHROPIC_API_KEY=sk-ant-...</code>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#a1a1aa] mt-[2px] shrink-0">·</span>
              <span>
                <strong className="text-[#d4d4d8]">Web-terminal paste:</strong> some
                browser-based terminals block <code className="font-mono text-[#1FAE85]">Ctrl+V</code>.
                Use{" "}
                <code className="font-mono text-[#1FAE85]">Ctrl+Shift+V</code> or right-click → Paste.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#a1a1aa] mt-[2px] shrink-0">·</span>
              <span>
                <strong className="text-[#d4d4d8]">npm cache 404 after publish:</strong> if
                you ever query a package before it&apos;s published, npm caches the 404.
                After publishing, run{" "}
                <code className="font-mono text-[#1FAE85]">npm cache clean --force</code>{" "}
                if{" "}
                <code className="font-mono text-[#1FAE85]">npm view</code> still 404s.
              </span>
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-12">
          <Section
            number={1}
            title="Add SeldonFrame to your IDE"
            body="The MCP server exposes SeldonFrame's primitive surface inside Claude Code. After this command, you can describe what you want and Claude will use SeldonFrame to build it."
            code="claude mcp add seldonframe"
          />
          <Section
            number={2}
            title="Create your workspace"
            body="A workspace is a branded business OS — its own CRM, theme, customer portal, and agent flows. Your first workspace is free forever."
            code='seldon init "my-workspace"'
          />
          <Section
            number={3}
            title="Scaffold your first block"
            body="Describe a capability — intake form, scheduling, equipment tracking — and SeldonFrame scaffolds production-ready code with admin UI, customer-portal surfaces, and tests."
            code="seldon scaffold block customer-intake"
          />
        </section>

        <section className="bg-[#111113] border border-white/5 rounded-[12px] p-6 md:p-8">
          <h2 className="text-[16px] font-semibold mb-3 text-[#fafafa]">What&apos;s next</h2>
          <ul className="space-y-2 text-[14px]">
            <li>
              <a href="/docs/mcp-servers" className="text-[#1FAE85] hover:underline">
                Browse MCP servers &rarr;
              </a>
              <span className="text-[#71717a]"> — extend your Business OS with 25+ verified external integrations</span>
            </li>
            <li>
              <a href="/demo" className="text-[#1FAE85] hover:underline">
                Watch the HVAC walkthrough &rarr;
              </a>
              <span className="text-[#71717a]"> — see a complete agency-deployed Business OS built end-to-end</span>
            </li>
            <li>
              <a href="/docs" className="text-[#1FAE85] hover:underline">
                Read the docs &rarr;
              </a>
              <span className="text-[#71717a]"> — primitives reference, API surface, architecture overview</span>
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
      </article>
    </MarketingShell>
  );
}
