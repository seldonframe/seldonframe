// v1.30.2 — Docs article: Build your first workspace.

import { ArticleShell, Callout, InAppLink, Step } from "../../article-shell";

export const metadata = {
  title: "Build your first workspace · Docs",
  description: "Create a SeldonFrame workspace in 60 seconds. Pick a template, set your brand, and you're live.",
};

export default function Page() {
  return (
    <ArticleShell
      category="Getting started"
      categoryHref="/docs"
      title="Build your first workspace"
      lede="60 seconds. Pick a template, set your name and color, and your dashboard, public site, and agent are wired up and ready."
      githubPath="app/docs/getting-started/first-workspace/page.tsx"
    >
      <h2>Step-by-step</h2>

      <Step n={1} title="Sign up">
        Go to <InAppLink href="/signup">/signup</InAppLink> and create your
        account with email or Google. You land on the dashboard with one
        starter workspace already created.
      </Step>

      <Step n={2} title="Pick a template">
        Open <InAppLink href="/marketplace">Templates</InAppLink>. Each
        template is a starter Soul (HVAC, dentist, coach, agency, e-commerce,
        consultant) — it pre-fills your CRM fields, pipeline stages,
        booking types, and a starter chatbot tuned for that vertical. You
        can swap or customize anything later.
      </Step>

      <Step n={3} title="Name it & set your brand">
        Open <InAppLink href="/settings/branding">Branding</InAppLink>.
        Give your business a name, upload a logo, and pick a primary
        color. The dashboard, your public site, and your chatbot all
        re-skin from this in real time.
      </Step>

      <Step n={4} title="Add your first contact">
        Open <InAppLink href="/contacts">Customers</InAppLink> and click
        "Add customer." Or import a CSV. Or — most fun — open Claude Code
        and say <em>"add Jane Doe (jane@example.com, 555-0100) to my CRM"</em>.
      </Step>

      <Step n={5} title="Go live">
        Your public site is already live at{" "}
        <code>your-workspace.app.seldonframe.com</code>. Want a custom
        domain like <code>www.yourbiz.com</code>? See{" "}
        <InAppLink href="/docs/your-business/custom-domains">Custom domains</InAppLink>.
      </Step>

      <Callout variant="tip" title="Skip the click-through">
        Step 2 onward is faster through Claude Code — see{" "}
        <a href="/docs/getting-started/connect-claude-code">Connect Claude Code</a>.
        It can pick a template, brand, add contacts, and even build a
        chatbot in one back-and-forth.
      </Callout>

      <h2>What's wired up automatically</h2>
      <ul>
        <li>
          A <strong>public landing page</strong> at your subdomain with your
          brand colors and a contact form.
        </li>
        <li>
          A <strong>CRM</strong> with starter pipeline stages and the custom
          fields your template needs (e.g. "service type" for HVAC).
        </li>
        <li>
          A <strong>starter chatbot</strong> in draft mode, tuned for your
          template. Run evals and publish when you're ready.
        </li>
        <li>
          An <strong>MCP token</strong> you can paste into Claude Code to
          drive everything from the terminal.
        </li>
      </ul>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/getting-started/connect-claude-code">Connect Claude Code</InAppLink></li>
        <li><InAppLink href="/docs/agents/build-chatbot">Build a chatbot</InAppLink></li>
        <li><InAppLink href="/docs/your-business/custom-domains">Custom domains</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
