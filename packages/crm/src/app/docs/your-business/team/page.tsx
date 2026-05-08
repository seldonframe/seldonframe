// v1.30.2 — Docs article: Team members.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Your business"
      categoryHref="/docs"
      title="Team members"
      lede="Invite teammates by email. Pick a role: owner, admin, editor, or viewer. Roles map to what they can do across the workspace."
      githubPath="app/docs/your-business/team/page.tsx"
    >
      <h2>Inviting</h2>
      <p>
        <InAppLink href="/settings/team">Settings → Team</InAppLink> →
        "Invite member." Enter their email, pick a role, send. They
        get an email with a setup link.
      </p>

      <h2>Roles</h2>
      <ul>
        <li><strong>Owner</strong> — full access. Can change billing, delete the workspace, transfer ownership. There must always be at least one.</li>
        <li><strong>Admin</strong> — full access except billing and member management.</li>
        <li><strong>Editor</strong> — can edit contacts, agents, pages, automations. Can't delete the workspace or change settings.</li>
        <li><strong>Viewer</strong> — read-only. Sees data, can run reports, can't change anything.</li>
      </ul>

      <Callout variant="info" title="Role per workspace">
        Roles are per-workspace, not per-account. Same person can be an
        owner of one workspace and a viewer of another.
      </Callout>

      <h2>SSO and provisioning</h2>
      <p>
        Email + password and Google sign-in are the supported methods
        today. SAML SSO is on the roadmap for the Agency tier — see{" "}
        <a href="/docs/billing/tiers">Plan tiers</a>.
      </p>

      <h2>Removing a member</h2>
      <p>
        <InAppLink href="/settings/team">Settings → Team</InAppLink> → row
        menu → "Remove from workspace." Their access ends immediately
        and any sessions are revoked. Their account on SeldonFrame stays
        — you're only removing them from this workspace.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/your-business/workspaces">Workspaces</InAppLink></li>
        <li><InAppLink href="/docs/billing/tiers">Plan tiers</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
