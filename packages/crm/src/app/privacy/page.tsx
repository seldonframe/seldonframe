import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — SeldonFrame",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">Privacy Policy — SeldonFrame</h1>
      <p className="text-sm text-muted-foreground">
        Effective date: July 2, 2026. If we materially change how we collect or use data, we
        will update the date above and post a summary of the change on this page — where a
        change is significant, we will also try to notify active workspace owners by email.
      </p>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">1. Introduction</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame (&quot;we,&quot; &quot;our,&quot; &quot;us&quot;) is a business identity operating system that helps service
          professionals stand up a complete front office — website, booking, intake, CRM, and AI agents — in one
          conversation. This Privacy Policy explains, in plain language, what we collect, why, who we share it with,
          how long we keep it, and what control you have over it. It covers the SeldonFrame product at
          app.seldonframe.com and hosted workspace subdomains (&lsquo;*.app.seldonframe.com&rsquo;), and it also covers
          SeldonFrame&apos;s tools when you use them through ChatGPT (see Section 8, which is written to match those
          tools&apos; exact inputs and outputs).
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">2. Data We Collect</h2>
        <p className="text-base leading-relaxed text-muted-foreground">We collect three categories of data:</p>
        <ul className="mt-3 list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>
            <strong>Business information you provide.</strong> Business or account name, email address, business
            description, an existing website URL, city, state, and phone number. You give us this directly — through
            the onboarding/soul wizard, a settings form, or one of the ChatGPT tools described in Section 8 (which
            collect the same fields: business name, description, website URL, city, state, phone).
          </li>
          <li>
            <strong>Content generated for your workspace.</strong> The website copy, page layout choices, and starter
            agent configuration we generate from the business information above, plus anything you or your agents
            add afterward — client/contact records, notes, booking history, and messages sent through the platform.
          </li>
          <li>
            <strong>Minimal operational data.</strong> We keep this to what is actually needed to run the service:
            authentication session data (for signed-in accounts), and, for the free/no-signup workspace-creation path,
            the requesting IP address — checked transiently against a rate limit (max 3 workspaces/hour, 10/day per
            IP) and not retained as a profile. We do not run marketing analytics/ad-tracking scripts on the product
            surfaces described in this policy.
          </li>
        </ul>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          <strong>What we do not collect through these tools and forms:</strong> we do not collect payment card
          numbers (Stripe handles checkout directly and we never see or store card data), protected health
          information, government-issued identification numbers, or authentication secrets/passwords via the
          ChatGPT tools or the workspace-creation forms described in this policy.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">3. Why We Use It (Purposes)</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li><strong>To generate and host your workspace</strong> — turning the business details you give us into a live public website, booking page, intake form, and starter AI agent, on a real subdomain.</li>
          <li><strong>To provide the core service</strong> — running your CRM, booking, messaging, and agent features, and keeping your business identity (&quot;soul&quot;) consistent across them.</li>
          <li><strong>To operate and secure the platform</strong> — rate-limiting abuse, debugging errors, and keeping the service available.</li>
          <li><strong>To support you</strong> — responding when you contact us with a question or a request about your data.</li>
        </ul>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          We do <strong>not</strong> use your business or client data to train AI models, and we do <strong>not</strong> use it for
          advertising or ad-targeting.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">4. Who We Share It With (Recipients / Sub-processors)</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          We do <strong>not</strong> sell your personal data, and we do <strong>not</strong> share it for third-party advertising. We use
          a small set of infrastructure providers to run the service, each bound to process data only to provide
          their service to us:
        </p>
        <ul className="mt-3 list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li><strong>Vercel</strong> — application hosting and serving your public workspace pages.</li>
          <li><strong>Neon (PostgreSQL)</strong> — our primary database, where workspace, contact, and business-record data is stored.</li>
          <li><strong>Anthropic and/or OpenAI</strong> — process the business details you provide (name, description, location, phone, website) to generate website copy and starter agent configuration for your workspace. These providers do not receive your client/contact records.</li>
          <li><strong>Stripe</strong> — payment processing for paid SeldonFrame plans and marketplace purchases. We never receive or store your card number; Stripe handles that directly.</li>
          <li><strong>Twilio</strong> — sends SMS (e.g. booking confirmations, reminders) only for workspaces that enable text messaging.</li>
          <li><strong>Resend</strong> — sends transactional email (e.g. booking confirmations, magic-link sign-in, welcome messages).</li>
          <li><strong>Composio</strong> — only for workspaces that explicitly connect a third-party integration (e.g. a calendar), to broker that connection.</li>
        </ul>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          We only send each provider the minimum data it needs to do its job. We may also disclose data if required
          by law, or to protect the rights, safety, or property of SeldonFrame or our users.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">5. Retention</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>A workspace and its data persist for as long as the workspace is active.</li>
          <li>
            An <strong>unclaimed</strong> workspace — one created without signing up, including any workspace created
            through the ChatGPT tools in Section 8 — is reachable via a temporary management link that expires
            about <strong>7 days</strong> after creation. Claiming the workspace (creating an account and linking it, via
            the claim link) removes that expiry and puts you in normal account-lifecycle retention.
          </li>
          <li>
            You can request deletion of a workspace and its data at any time — see Section 6. We remove the
            underlying records within a reasonable time after a verified request, except where we are required to
            keep certain records (e.g. billing records) for legal or accounting purposes.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">6. Your Controls &amp; Rights</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>
            <strong>Claim, manage, or delete your workspace</strong> using the claim/admin link returned when the
            workspace was created (or, once claimed, from your account dashboard).
          </li>
          <li>You can export your data at any time.</li>
          <li>You can disconnect any optional integration (Google OAuth, Composio connections, etc.) at any time.</li>
          <li>
            You can request access to, correction of, or deletion of your personal data, or object to a particular
            use, by contacting us at the address in Section 10 — consistent with rights available under laws such
            as the GDPR and CCPA, regardless of where you are located. We will verify the request and respond within
            a reasonable time.
          </li>
          <li>For self-hosted deployments: your data never leaves your own infrastructure.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">7. Data Storage and Security</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>Data is stored on servers in the United States (Vercel, Neon PostgreSQL).</li>
          <li>All data is encrypted in transit (HTTPS/TLS).</li>
          <li>Sensitive credentials (API keys, integration tokens) are encrypted at rest.</li>
          <li>We use industry-standard security practices, and access to production data is limited to what is needed to operate the service.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">8. Using SeldonFrame Through ChatGPT</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame exposes three tools to ChatGPT (via the Model Context Protocol). No SeldonFrame account or API
          key is required to use them. This table lists exactly what each tool collects, what it returns, how that
          data is used, and how long it is kept:
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm leading-relaxed text-muted-foreground">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-semibold text-foreground">Tool</th>
                <th className="py-2 pr-4 font-semibold text-foreground">Collects (inputs)</th>
                <th className="py-2 pr-4 font-semibold text-foreground">Returns (outputs)</th>
                <th className="py-2 pr-4 font-semibold text-foreground">How it&apos;s used</th>
                <th className="py-2 font-semibold text-foreground">Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-4"><code>build_workspace</code></td>
                <td className="py-3 pr-4">
                  Business name (required), description, an existing website URL, city, state, phone — whatever you
                  give ChatGPT to describe the business.
                </td>
                <td className="py-3 pr-4">
                  The new workspace&apos;s public URL, a <code>workspaceToken</code>, and a <code>claimUrl</code>.
                </td>
                <td className="py-3 pr-4">
                  Creates and hosts a public business website/workspace. The business details are sent to our LLM
                  provider (Anthropic and/or OpenAI) to generate the site copy and a starter agent configuration.
                  The <code>workspaceToken</code> is <strong>not an account credential or API key</strong> — it is a
                  short-lived, single-workspace management handle scoped only to the one workspace it created,
                  used so you can keep configuring that workspace later in the same chat or via the claim link.
                </td>
                <td className="py-3">
                  Workspace persists while active. If never claimed, the <code>workspaceToken</code> /{" "}
                  <code>claimUrl</code> expire after about 7 days.
                </td>
              </tr>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-4"><code>browse_marketplace</code></td>
                <td className="py-3 pr-4">Free-text search query and/or a category (niche) filter. No business or personal data required.</td>
                <td className="py-3 pr-4">A list of matching free agents: name, description, category, and slug. No prices are shown — every agent listed through ChatGPT is free.</td>
                <td className="py-3 pr-4">Read-only lookup against our public agent catalog. Nothing is stored, and nothing you provide is used for any purpose beyond returning the search results.</td>
                <td className="py-3">Not retained — this tool does not write any data.</td>
              </tr>
              <tr className="align-top">
                <td className="py-3 pr-4"><code>deploy_agent</code></td>
                <td className="py-3 pr-4">The <code>workspace_token</code> from <code>build_workspace</code> and the <code>agent_slug</code> of the chosen agent.</td>
                <td className="py-3 pr-4">Whether the install succeeded, the agent&apos;s name, and a URL to manage it.</td>
                <td className="py-3 pr-4">
                  Installs a free agent configuration into the workspace identified by your token. This tool never
                  takes payment or links out to a purchase flow — through ChatGPT, only free agents can be installed;
                  an agent that is not free is simply not installed (the tool suggests choosing a free agent instead).
                </td>
                <td className="py-3">Follows the target workspace&apos;s retention (see Section 5) — the installed configuration lives with that workspace.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          None of these three tools collect payment-card data, protected health information, government identifiers,
          or passwords/API keys — there is nowhere in their inputs for that data to go. Rate-limiting on{" "}
          <code>build_workspace</code> checks the request&apos;s IP address transiently against a counter (3/hour,
          10/day) and does not build a profile from it.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">9. Google OAuth</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          When you sign in with Google, we receive your name and email address from your Google account. We do not
          access your Google contacts, calendar, drive, or any other Google services unless you explicitly connect
          them in Settings. We use Google OAuth solely for authentication.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">10. SMS / Text Messaging &amp; Mobile Information</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          When you opt in to text messaging — by submitting a form, checking a consent box, or texting us
          — you agree to receive recurring automated messages at the mobile number you provide. We collect
          your mobile phone number and messaging consent so we (or the business operating on SeldonFrame)
          can send you SMS such as booking confirmations, appointment reminders, missed-call follow-ups,
          and review requests.
        </p>
        <ul className="mt-3 list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>
            <strong>
              We do not sell or share your mobile information, phone number, or SMS opt-in/consent data
              with third parties or affiliates for their own marketing or promotional purposes.
            </strong>
          </li>
          <li>
            We may share this information only with service providers who help us operate the messaging
            program (such as our SMS carrier, Twilio), and strictly to deliver the service.
          </li>
          <li>
            You can opt out at any time by replying <strong>STOP</strong>, or reply{" "}
            <strong>HELP</strong> for assistance.
          </li>
          <li>Message and data rates may apply; message frequency varies.</li>
        </ul>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          See our{" "}
          <Link href="/terms" className="underline-offset-4 hover:underline">
            Terms of Service
          </Link>{" "}
          for the full SMS program disclosures (opt-out, HELP, message frequency, and rates).
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">11. Children&apos;s Privacy</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame is a general-audience business tool intended for users aged 13 and older, and is not directed
          to children under 13. We do not knowingly collect personal data from children under 13. If you believe a
          child has provided us with personal data, contact us at the address below and we will remove it.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">12. Open Source</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame is open source. The source code is available at github.com/seldonframe/seldonframe. Self-hosted users
          control their own data entirely — no data is sent to SeldonFrame servers.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">13. Contact &amp; Support</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          For privacy questions, or to request access to, correction of, export of, or deletion of your data:{" "}
          <a href="mailto:hello@seldonframe.com" className="underline-offset-4 hover:underline">
            hello@seldonframe.com
          </a>
          {" "}(general support is also reachable at{" "}
          <a href="mailto:support@seldonframe.com" className="underline-offset-4 hover:underline">
            support@seldonframe.com
          </a>
          ).
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">14. Changes to This Policy</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          We may update this policy as the product changes — including as we add or change what the ChatGPT tools in
          Section 8 collect and return. Changes are posted on this page with an updated effective date; for
          significant changes we will also try to notify active workspace owners by email.
        </p>
      </section>

      <footer className="mt-12 flex flex-wrap items-center gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link href="/" className="underline-offset-4 hover:underline">
          Back to Home
        </Link>
        <Link href="/terms" className="underline-offset-4 hover:underline">
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}
