// v1.30.2 — Docs article: Workspaces.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Your business"
      categoryHref="/docs"
      title="Workspaces"
      lede="A workspace is one isolated business: its own contacts, agents, pages, brand, and domain. You can have as many as you need under one account."
      githubPath="app/docs/your-business/workspaces/page.tsx"
    >
      <h2>Why workspaces</h2>
      <p>
        SeldonFrame is multi-tenant by design. One person can run several
        independent businesses (a coaching practice + a Shopify store + a
        side agency) without their data, agents, or branding bleeding
        between them. Agencies use the same model to host clients — each
        client is a workspace under the agency's account.
      </p>

      <h2>Switching</h2>
      <p>
        Click your workspace name in the top-left of the sidebar. The
        switcher shows every workspace you have access to with client
        count and current Soul. Switch and the entire dashboard re-skins
        — sidebar, brand, theme, data, all of it.
      </p>

      <h2>Creating one</h2>
      <p>
        <InAppLink href="/orgs/new">Create new workspace</InAppLink>. You
        pick a name, a slug (which becomes your subdomain), and a starter
        template. 60 seconds to a fully wired workspace.
      </p>

      <Callout variant="tip" title="One LLM key, many workspaces">
        Your Anthropic / OpenAI key is set per-workspace. If you want all
        your workspaces to share one bill, paste the same key into each.
        If you want each client to bring their own, paste theirs.
      </Callout>

      <h2>Permissions</h2>
      <p>
        Per-workspace member roles: owner, admin, editor, viewer. See{" "}
        <InAppLink href="/docs/your-business/team">Team members</InAppLink>.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/your-business/custom-domains">Custom domains</InAppLink></li>
        <li><InAppLink href="/docs/your-business/branding">Branding & theme</InAppLink></li>
        <li><InAppLink href="/docs/your-business/team">Team members</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
