// v1.30.2 — Docs article: Public pages.

import { ArticleShell, Callout, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Pages & website"
      categoryHref="/docs"
      title="Public pages"
      lede="Every workspace gets a public site at your-name.app.seldonframe.com. Add landing pages, services pages, blog posts — all themed from your brand."
      githubPath="app/docs/pages/public-pages/page.tsx"
    >
      <h2>Your subdomain</h2>
      <p>
        When you create a workspace called "Acme HVAC," you immediately
        get <code>acme-hvac.app.seldonframe.com</code>. It's live the
        moment you sign up — with a starter homepage that pulls your
        business name, brand color, and logo.
      </p>

      <h2>Adding a page</h2>
      <Step n={1} title="Open the editor">
        <InAppLink href="/landing">Pages</InAppLink> → "New page."
      </Step>
      <Step n={2} title="Pick a template or start blank">
        Templates: services, pricing, about, blog post, "thank you" page.
        Each is a starter you can edit freely.
      </Step>
      <Step n={3} title="Edit blocks">
        Pages are composed of blocks (hero, features grid, pricing table,
        contact form, booking widget, FAQ, testimonials, CTA). Drag,
        drop, edit copy inline.
      </Step>
      <Step n={4} title="Set the slug and publish">
        <code>/services/furnace-repair</code> → live at{" "}
        <code>acme-hvac.app.seldonframe.com/services/furnace-repair</code>.
      </Step>

      <h2>Through Claude Code</h2>
      <p>
        Same flow, faster. Tell Claude Code:{" "}
        <em>"Build me a 'Furnace repair' service page with a hero, three
        pricing tiers, an FAQ, and a 'Book now' button that opens my
        chatbot."</em> The MCP tool is <code>create_landing_page</code>.
      </p>

      <Callout variant="tip" title="The chatbot follows you everywhere">
        Once you have a published agent, every public page automatically
        carries the chatbot bubble (toggleable per page in Settings). No
        embed snippet needed for SF-hosted pages.
      </Callout>

      <h2>SEO basics</h2>
      <p>
        Each page has fields for title, meta description, and OG image.
        SeldonFrame sets sensible defaults from your block content but
        you should override them for any page you actually want to rank.
      </p>

      <h2>Custom domain</h2>
      <p>
        Want <code>www.acmehvac.com</code> instead of the subdomain? See{" "}
        <InAppLink href="/docs/your-business/custom-domains">Custom domains</InAppLink>.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/pages/forms">Forms & lead capture</InAppLink></li>
        <li><InAppLink href="/docs/pages/booking">Booking pages</InAppLink></li>
        <li><InAppLink href="/docs/pages/templates">Templates</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
