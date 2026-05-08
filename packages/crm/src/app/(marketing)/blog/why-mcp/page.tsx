// /blog/why-mcp — first real launch-week blog post.
// v1.31.3 — explains the MCP-native architecture choice that
// differentiates SF from chatbot-wrapper startups.

import type { Metadata } from "next";
import { MarketingShell } from "../../marketing-shell";

export const metadata: Metadata = {
  title: "Why we built SeldonFrame on MCP — Blog",
  description:
    "Most AI startups wrap a chatbot UI around an LLM. SeldonFrame exposes the whole product as MCP tools and lets Claude Code be the chrome. Here's why.",
};

export default function Post() {
  return (
    <MarketingShell>
      <article className="max-w-[720px] mx-auto px-5 md:px-12 py-16 md:py-24">
        <header className="mb-12">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-3">May 7, 2026 · Architecture</p>
          <h1 className="text-[clamp(30px,4vw,46px)] font-bold tracking-[-0.035em] text-[#fafafa] mb-4 leading-[1.1]">
            Why we built SeldonFrame on MCP
          </h1>
          <p className="text-[17px] text-[#a1a1aa] leading-[1.7]">
            Most AI startups wrap a chatbot UI around an LLM. We took the
            opposite bet: expose the whole product as MCP tools and let
            Claude Code be the chrome.
          </p>
        </header>

        <div className="marketing-prose">
          <h2>The default architecture is wrong</h2>
          <p>
            If you've shipped an AI product in the last two years, you
            know the default playbook. Pick a frontier model. Wrap it
            in a React app. Add tool calls for the few actions your
            product needs. Sell access by the seat. The user types into
            your input box; your backend orchestrates the model; your
            UI renders the result.
          </p>
          <p>
            This was the right choice in 2023 because models were thin
            and fragile. You had to handhold the LLM through every
            interaction. The chrome was the product because the chrome
            was the entire surface area where intelligence couldn't be
            trusted to operate alone.
          </p>
          <p>
            That's not where models are now.
          </p>

          <h2>What changed: agents have IDEs</h2>
          <p>
            Claude Code, Cursor, Windsurf, Devin — agents now live
            inside the developer's IDE. They read files, run shells,
            call APIs, write code. They don't need a custom chrome
            because they already have one. The chrome is the IDE.
          </p>
          <p>
            And critically: those agents speak <strong>MCP</strong> —
            Model Context Protocol — Anthropic's standard for letting
            an LLM call into external systems. If you ship an MCP
            server, every MCP-aware agent can drive your product.
          </p>

          <h2>The bet: expose everything as tools</h2>
          <p>
            SeldonFrame's product is a Business OS — CRM, public site,
            agents, automations. The competitor playbook would be to
            ship a beautiful React admin and call it a day. We did
            that, but we also did something else: we exposed the
            entire product as 140+ MCP tools.
          </p>
          <p>
            Read your contacts. Create a deal. Build a chatbot.
            Configure its Soul. Run an eval suite. Publish the agent.
            Read its conversations. All as tool calls. Every clickable
            surface in the dashboard maps to one or more MCP tools an
            agent can drive.
          </p>
          <p>
            This means: an HVAC business owner can build their entire
            customer-operation stack by talking to Claude Code. They
            don't have to learn the dashboard. The dashboard is for
            inspection and overrides — not for the build.
          </p>

          <h2>Why this works</h2>
          <p>
            Three reasons.
          </p>
          <p>
            <strong>One — the agent is faster than the human at click-through.</strong>{" "}
            Building a chatbot through the dashboard is 8-10 clicks,
            field entries, eval-suite setup, publish gate. Through
            Claude Code it's <em>"build me a chatbot for my HVAC
            business that books diagnostic visits"</em> — the agent
            calls 3-4 MCP tools, runs evals, publishes. Two minutes,
            zero clicks.
          </p>
          <p>
            <strong>Two — the agent improves automatically.</strong>{" "}
            When Claude Sonnet 4.5 ships, every SeldonFrame customer's
            build experience gets better — without us shipping
            anything. The same is true for the runtime: agents in
            production that use better LLMs make better decisions,
            with no SF-side changes. The architecture is antifragile
            to model improvements.
          </p>
          <p>
            <strong>Three — the dashboard stays simple.</strong>{" "}
            We don't have to design a "build wizard" with progressive
            disclosure for every config option. The dashboard is for
            <em>operating</em> what's been built, not for the build
            itself. Operators see a simple "your agents" list and a
            "your customers" CRM. Builders use Claude Code.
          </p>

          <h2>What we gave up</h2>
          <p>
            Marketing-page conversions. A first-time visitor who
            doesn't already use Claude Code can't immediately
            experience the magic. They have to install the MCP server,
            paste a token, and learn a new flow.
          </p>
          <p>
            That's a real cost. We mitigate it two ways: (1) the
            dashboard is fully self-serve, so non-Claude-Code users
            can still build everything by clicking; (2) the launch
            video shows the Claude Code flow end-to-end, so visitors
            see the magic before they have to install anything.
          </p>
          <p>
            But if you take nothing else from this post: the architecture
            choice between "build a chatbot UI" and "expose as MCP tools"
            isn't aesthetic. It's a bet on whether agents-in-IDEs become
            the dominant chrome for non-trivial software. We bet yes.
          </p>

          <h2>What's next</h2>
          <p>
            More posts in this series will cover the eval gate (how an
            8-scenario suite gates publish + a runtime validator
            catches hallucinations on the fly), the BYOK economics
            (why we don't markup tokens), and the durable-workflow
            architecture (Vercel Workflows powering post-booking
            reminders that survive deploys).
          </p>
          <p>
            Follow{" "}
            <a
              href="https://x.com/seldonframe"
              target="_blank"
              rel="noopener noreferrer"
            >
              @seldonframe on 𝕏
            </a>{" "}
            for new posts, or join the{" "}
            <a
              href="https://discord.gg/sbVUu976NW"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord
            </a>{" "}
            if you want to talk to the team about the architecture.
          </p>
        </div>

        <footer className="mt-16 pt-8 border-t border-white/5 flex items-center justify-between text-[14px]">
          <a href="/blog" className="text-[#71717a] hover:text-[#fafafa] transition-colors">
            ← All posts
          </a>
          <a
            href="https://github.com/seldonframe/seldonframe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1FAE85] hover:underline font-semibold"
          >
            Browse the source on GitHub →
          </a>
        </footer>
      </article>
    </MarketingShell>
  );
}
