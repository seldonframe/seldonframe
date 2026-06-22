// v1.30.2 — Docs article: Templates.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Pages & website"
      categoryHref="/docs"
      title="Templates"
      lede="Pre-built starter packs for common verticals. Pick HVAC and your CRM fields, pipeline, booking types, and starter chatbot are pre-tuned for the trade."
      githubPath="app/docs/pages/templates/page.tsx"
    >
      <h2>What a template includes</h2>
      <p>
        A template (we call them "Souls") is a starter blueprint for a
        whole vertical. When you pick one, SeldonFrame pre-configures:
      </p>
      <ul>
        <li><strong>Custom CRM fields</strong> for what that business tracks (e.g. HVAC: equipment age, last service, AHRI ratings).</li>
        <li><strong>Pipeline stages</strong> tuned for the trade ("New lead → Quote sent → Job scheduled → Job done → Invoice paid").</li>
        <li><strong>Booking types</strong> (HVAC: diagnostic, install, maintenance).</li>
        <li><strong>Starter chatbot</strong> with FAQ, tone, and refusal rules tuned for the vertical.</li>
        <li><strong>Email templates</strong> (quote follow-up, booking confirmation, post-job thank-you).</li>
        <li><strong>A starter landing page</strong> with services, pricing tiers, and a contact form pre-wired.</li>
      </ul>

      <h2>Available templates</h2>
      <p>
        Browse them in <InAppLink href="/templates">Templates</InAppLink>.
        Current set:
      </p>
      <ul>
        <li><strong>HVAC</strong> — furnace and AC contractors.</li>
        <li><strong>Dental</strong> — small practice with cleaning, fillings, whitening, emergency.</li>
        <li><strong>Coach</strong> — life / executive / health coach with discovery call + paid sessions.</li>
        <li><strong>Agency</strong> — service agency selling retainers and projects.</li>
        <li><strong>E-commerce</strong> — small Shopify-style merchant.</li>
        <li><strong>Consultant</strong> — solo consultant with a discovery call funnel.</li>
        <li><strong>Blank</strong> — start from scratch.</li>
      </ul>

      <Callout variant="tip" title="Templates are starting points">
        Everything in a template is editable after you pick it. Templates
        save you the first hour of click-through; they don't lock you
        into anything. You can also evolve away from a template entirely
        by editing fields, stages, and the agent's Soul.
      </Callout>

      <h2>Building your own template</h2>
      <p>
        For agencies running 10+ clients on the same vertical: bundle
        your custom fields, stages, and tuned chatbot into a private
        template. New clients onboard in 60 seconds with your exact
        configuration.
      </p>
      <p>
        Today this is a manual process — open a GitHub issue with the
        config you want bundled and we'll add it to your agency. A
        self-serve template builder is on the roadmap.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/getting-started/first-workspace">Build your first workspace</InAppLink></li>
        <li><InAppLink href="/docs/agents/build-chatbot">Build a chatbot</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
