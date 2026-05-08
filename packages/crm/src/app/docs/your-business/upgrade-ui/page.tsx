// v1.34.1 — Docs article: Upgrade your UI (for power users).
//
// Explains the SF UI-customization model: smart defaults, the four
// levers, and the thin-harness/fat-skill philosophy. For operators
// who want to push their site beyond the balanced preset.

import { ArticleShell, Callout, CodeBlock, InAppLink, Step } from "../../article-shell";

export const metadata = {
  title: "Upgrade your UI · Docs",
  description:
    "Your SeldonFrame site already ships polished by default. When you want it to look like a $10K design — apply a motion preset, bring a DESIGN.md, import a Claude Design handoff, or fork the block library.",
};

export default function Page() {
  return (
    <ArticleShell
      category="Your business"
      categoryHref="/docs"
      title="Upgrade your UI"
      lede="Every SeldonFrame workspace ships polished by default — scroll-reveal on sections, stagger on grids, hover-lift on CTAs. When you want more, four levers stack on top, each composable through Claude Code in one prompt."
      githubPath="app/docs/your-business/upgrade-ui/page.tsx"
    >
      <h2>Start with the smart defaults</h2>
      <p>
        Before reaching for any of the levers below — your site already
        does the right thing out of the box. Every published page wraps
        its sections in scroll-triggered fades; grid blocks (benefits,
        features, pricing, process) stagger their children in
        sequentially; the primary CTA lifts and glows on hover.
      </p>
      <p>
        This is the <strong>balanced</strong> motion preset, applied
        universally. It's calibrated to feel premium without being
        theatrical. For 80% of operators, this is the finish line.
      </p>

      <Callout variant="tip" title="Why we don't ask">
        SeldonFrame doesn't pop a wizard asking you to "configure your
        animations" after workspace creation. The defaults are the
        defaults. You only need this page if you want to push beyond.
      </Callout>

      <h2>The four levers, in order of effort</h2>

      <h3>Lever 1 — Tune motion intensity</h3>
      <p>
        One MCP tool, one prompt. Pick a preset that matches your brand voice:
      </p>
      <ul>
        <li>
          <strong>minimal</strong> — no motion. Accessibility-first.
          Respects <code>prefers-reduced-motion</code>. Pages feel fast,
          deliberate, restrained.
        </li>
        <li>
          <strong>subtle</strong> — fade-up reveals only. Quiet,
          professional, never distracts from your content.
        </li>
        <li>
          <strong>balanced</strong> (default) — reveals + stagger +
          hover-lift. Premium feel without being theatrical.
        </li>
        <li>
          <strong>editorial</strong> — full effects. Animated stat
          counters, magnetic CTAs that follow the cursor, scroll-linked
          parallax, word-by-word headline reveals. Use when your brand
          is brave.
        </li>
      </ul>
      <p>In Claude Code:</p>
      <CodeBlock language="text">{`> Make my site feel more editorial.

  ● apply_motion_preset({ preset: "editorial" })  200 ok
  ✓ Switched motion preset from "balanced" to "editorial"`}</CodeBlock>
      <p>
        The preset is also stored as <em>operator intent</em> — when
        Claude Code generates new content (a custom block, a new
        section), it reads your preset and matches the level you picked.
      </p>

      <h3>Lever 2 — Bring your DESIGN.md</h3>
      <p>
        If you have a brand kit defined in the{" "}
        <a
          href="https://github.com/google-labs-code/design.md"
          target="_blank"
          rel="noopener"
        >
          Google Labs DESIGN.md format
        </a>{" "}
        — YAML front matter with tokens (colors, typography, spacing) +
        Markdown rationale — apply it in one prompt:
      </p>
      <CodeBlock language="text">{`> Apply the DESIGN.md in this folder to my workspace.

  ● apply_design_md({ design_md_content: <file content> })  200 ok
  ✓ Applied tokens: primary_color, accent_color, font_family
  → 2 token group(s) didn't map to OrgTheme fields. Surface
    via update_landing_page if you want them as CSS custom
    properties on specific pages.`}</CodeBlock>
      <p>
        Maps cleanly: <code>tokens.colors.primary</code> →{" "}
        <code>OrgTheme.primaryColor</code>;{" "}
        <code>tokens.colors.accent</code> →{" "}
        <code>OrgTheme.accentColor</code>;{" "}
        <code>tokens.mode</code> → <code>OrgTheme.mode</code>;{" "}
        <code>tokens.typography.body</code> →{" "}
        <code>OrgTheme.fontFamily</code>. Tokens that don't have a 1:1
        equivalent come back in <code>unmapped</code> for Claude Code
        to apply via <code>update_landing_page</code> as CSS custom
        properties on individual pages.
      </p>
      <Callout variant="info" title="Use this for">
        Agencies running 20+ client workspaces from one DESIGN.md per
        client. Brand teams with a single canonical token file.
        Operators who want consistent branding without manually setting
        each color.
      </Callout>

      <h3>Lever 3 — Import a Claude Design handoff</h3>
      <p>
        If you designed a custom hero, pricing table, or case-study
        section in{" "}
        <a
          href="https://www.anthropic.com/news/claude-design-anthropic-labs"
          target="_blank"
          rel="noopener"
        >
          Anthropic Claude Design
        </a>
        , export the handoff bundle and pipe it through Claude Code:
      </p>
      <CodeBlock language="text">{`> I just exported a handoff from Claude Design. Import it.

  ● import_claude_design_handoff({ bundle: { ... } })  200 ok
  → 4 components validated: HeroV2, TrustStrip, PricingTable, CTAStrip
  → Tokens applied: primary_color, accent_color
  → For each component, run update_landing_page with the source from
    the bundle to wire it into the chosen surface.`}</CodeBlock>
      <p>
        The handoff endpoint validates structure, applies any embedded
        design tokens, and returns a manifest with per-component
        next-step instructions. Components are <strong>not</strong>{" "}
        auto-applied to live pages — they route through the same
        review gate that protects published agents. Customer-facing
        surfaces still pass the eval suite before going live.
      </p>

      <h3>Lever 4 — Fork the block library directly</h3>
      <p>
        SeldonFrame is MIT-licensed. For pixel-perfect customization
        beyond what the levers above support:
      </p>
      <Step n={1} title="Fork the repo">
        <CodeBlock language="bash">{`gh repo fork seldonframe/seldonframe --clone
cd seldonframe
pnpm install
pnpm dev`}</CodeBlock>
      </Step>
      <Step n={2} title="Edit a block component">
        Block components live at{" "}
        <code>packages/crm/src/components/landing/sections/</code>. Each
        is a standalone React component (hero.tsx, pricing.tsx, etc.).
        Edit freely; deploy.
      </Step>
      <Step n={3} title="Add custom blocks">
        Register a new block in{" "}
        <code>packages/crm/src/components/landing/block-registry.tsx</code>.
        It instantly becomes available to Claude Code via the MCP — the
        registry IS the contract.
      </Step>
      <Step n={4} title="Use the motion primitives">
        SF ships 8 composable motion primitives at{" "}
        <code>packages/crm/src/components/motion/</code> — RevealOnScroll,
        Stagger, HoverLift, Counter, TextReveal, Marquee, MagneticButton,
        Parallax. Mix into any custom block:
        <CodeBlock language="tsx">{`import { TextReveal, Stagger, MagneticButton } from "@/components/motion";

<TextReveal as="h1" wordDelay={0.08}>
  Your custom hero headline
</TextReveal>

<Stagger className="grid gap-4 md:grid-cols-3" childDelay={0.1}>
  {features.map(f => <Card key={f.id}>{...}</Card>)}
</Stagger>

<MagneticButton strength={10}>
  Book your service
</MagneticButton>`}</CodeBlock>
      </Step>

      <h2>The thin-harness, fat-skill principle</h2>
      <p>
        The four levers above stack because of one architectural choice:
        SeldonFrame doesn't hardcode "specific animations for specific
        blocks." That would be brittle — every new vertical needs a new
        preset, and the animations don't get better when models do.
      </p>
      <p>
        Instead, the platform ships a small set of composable primitives.
        The <em>skill</em> of choosing which primitives to compose lives
        in Claude Code, not in our TypeScript. When an operator says{" "}
        <em>"make my hero more impactful,"</em> Claude Code picks{" "}
        <code>TextReveal</code> on the headline +{" "}
        <code>Stagger</code> on CTAs +{" "}
        <code>MagneticButton</code> on the primary button +{" "}
        <code>RevealOnScroll</code> on the section below.
      </p>
      <p>
        As frontier models improve at this composition, every workspace
        gets richer — without us shipping new animation code. That's
        antifragile. That's the bet.
      </p>

      <Callout variant="tip" title="The principle in one line">
        The platform is dumb. The skill-pack is markdown. The model
        gets better, your site gets better — same code, better outcome.
      </Callout>

      <h2>What's deferred (and why)</h2>
      <ul>
        <li>
          <strong>Renderer-level preset gating.</strong> Today the{" "}
          <code>balanced</code> set's primitives apply universally;{" "}
          <code>minimal</code> stores intent but doesn't yet
          short-circuit wrapping in the renderer. Ships in v1.34.x as
          a context provider.
        </li>
        <li>
          <strong>Counter on stat blocks.</strong> No dedicated stat
          block exists in the current library. When one's added (or
          you add one), wire <code>{`<Counter>`}</code> into it directly.
        </li>
        <li>
          <strong>Per-block motion overrides.</strong> Want{" "}
          <code>editorial</code> motion on the hero but{" "}
          <code>minimal</code> on the booking calendar? Today, you fork
          the section component. v1.5 ships per-block overrides via
          MCP.
        </li>
      </ul>

      <h2>Next</h2>
      <ul>
        <li>
          <InAppLink href="/docs/your-business/branding">
            Branding & theme
          </InAppLink>
        </li>
        <li>
          <InAppLink href="/docs/agents/build-chatbot">
            Build a chatbot
          </InAppLink>
        </li>
        <li>
          <InAppLink href="/docs/getting-started/connect-claude-code">
            Connect Claude Code
          </InAppLink>
        </li>
      </ul>
    </ArticleShell>
  );
}
