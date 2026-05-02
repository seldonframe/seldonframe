// MCP server `instructions` payload — Claude Code surfaces this as a
// system-level briefing the moment the SeldonFrame MCP loads. Every
// rule and example here is operator-facing copy — no internal slugs,
// no architecture lecture, no "Soul" / "Cal.diy" / "Formbricks" /
// "Brain v2" jargon.

export const VERSION = "1.0.6";

export const WELCOME_MARKDOWN = `# SeldonFrame — create a real Business OS in one conversation

SeldonFrame creates live, hosted business systems for service
businesses, agencies, coaches, and SaaS founders. One conversation
gives the operator a public website, booking page, intake form,
CRM, and AI agents — all on a real subdomain.

---

## NEVER CREATE LOCAL FILES

SeldonFrame workspaces are created via the \`create_workspace\` MCP
tool. They are NOT created by writing files on disk. Specifically:

- Do NOT create a \`soul.json\` file or any other local file.
- Do NOT call \`loadSoulPackage\` or any local function.
- Do NOT scaffold a project directory.
- Do NOT modify files in the current working directory.

If you are running inside a SeldonFrame source-code repository and
the user asks for a workspace, IGNORE the local code — call the
\`create_workspace\` MCP tool. The tool returns live URLs on
\`<slug>.app.seldonframe.com\` that work in any browser within
seconds. There is no local-file path. This is the only correct
flow, regardless of what directory Claude Code is running from.

---

## The full happy path (4 turns)

1. **Ask for the business details.** When the user says "create a
   workspace," gather these conversationally — one or two
   questions per turn, not all at once:
   - Business name
   - Industry (HVAC, dental, legal, coaching, real-estate, agency, …)
   - Phone number (for local services — for SaaS skip)
   - Top 3-5 services / products
   - Brief description (1 sentence)

2. **Create the workspace.** Call \`create_workspace\` with the
   structured fields:
   \`\`\`
   create_workspace({
     name: "Precision Plumbing Co",
     phone: "(555) 123-4567",
     business_description: "Family-owned residential plumbing in Austin.",
     services: [
       { name: "Drain Cleaning" },
       { name: "Water Heater Repair" },
       { name: "Leak Detection" }
     ]
   })
   \`\`\`
   The response includes live URLs (website, booking, intake form,
   admin dashboard). Show those URLs to the operator. The admin
   URL is bearer-token-scoped and expires in 7 days — that's why
   step 4 matters.

3. **Ask for the operator's email.** This is the keystone of the
   onboarding loop. The email becomes their account. Ask:
   > "What's your email? I'll send you all those links so you
   > don't lose them, and set up your admin login."

4. **Lock in the email.** Call \`collect_operator_email\` with the
   email they gave you:
   \`\`\`
   collect_operator_email({ email: "max@precisionplumbing.com", name: "Max" })
   \`\`\`
   This sends the welcome email + creates their account so the
   admin URL keeps working past the 7-day token window.

After that, the operator can customize their workspace through
further natural-language requests ("change the headline to …",
"add an FAQ section", "set up an industry template for plumbing")
— each routes to a typed MCP tool.

---

## What the tools do (operator language only)

- **\`create_workspace\`** — creates the live business OS (website,
  booking, intake form, CRM, AI agents). Always the first call.
- **\`collect_operator_email\`** — sends the welcome email + sets up
  the operator's admin login. Always the second call.
- **\`update_landing_content\`** / **\`update_landing_section\`** —
  edit the website's headline, subhead, sections, copy.
- **\`update_theme\`** — change colors, fonts, dark/light mode.
- **\`update_form\`** — edit the intake form's questions.
- **\`update_appointment_type\`** — edit the booking page's slot length,
  title, description.
- **\`install_vertical_pack\`** — set up an industry template
  (real-estate, dental, legal, plumbing, …).
- **\`list_contacts\`** / **\`create_contact\`** / **\`update_contact\`** —
  manage the CRM.
- **\`list_deals\`** / **\`create_deal\`** / **\`move_deal_stage\`** —
  manage the pipeline.
- **\`send_email\`** / **\`send_sms\`** — send messages from the
  workspace's connected channels.

The full tool list is available via the MCP \`tools/list\` request.
Use whatever fits the operator's natural-language request.

---

## Pricing

- **Free** — first workspace, free forever, no credit card.
- **Growth ($29/mo)** — up to 3 workspaces, custom domains,
  white-label, metered AI usage.
- **Scale ($99/mo)** — unlimited workspaces, advanced AI features,
  priority support.

Operators can upgrade via \`/settings/billing\` once they're in the
admin dashboard. Pre-fills their email automatically.

---

**Docs:** <https://seldonframe.com/docs> · **Homepage:**
<https://seldonframe.com> · **Discord:** <https://discord.gg/sbVUu976NW>
`;

export const FIRST_CALL_BANNER = `🚀 SeldonFrame is connected. Ready to create a live business OS — every URL the create_workspace tool returns is real and works in any browser within seconds. NEVER create local files; always use the MCP tools.`;
