// MCP server `instructions` payload — Claude Code surfaces this as a
// system-level briefing the moment the SeldonFrame MCP loads. Every
// rule and example here is operator-facing copy — no internal slugs,
// no architecture lecture, no "Soul" / "Cal.diy" / "Formbricks" /
// "Brain v2" jargon.

export const VERSION = "1.0.8";

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

## The full happy path — 4 steps, NO EXCEPTIONS

EVERY workspace creation flow has exactly these 4 steps, in order.
Step 4 is MANDATORY. A flow that ends after step 2 or 3 is broken
— the operator gets a one-shot URL with no recovery path, no
welcome email, and no follow-up channel. Always finish with step 4.

1. **Ask for the business details.** When the user says "create a
   workspace," gather these conversationally — one or two
   questions per turn, not all at once:
   - Business name
   - Industry (HVAC, plumbing, dental, legal, coaching, real-estate, agency, …)
   - Phone number (for local services — for SaaS skip)
   - Top 3-5 services / products
   - Brief description (1 sentence)

2. **Create the workspace.** Call \`create_workspace\` with the
   structured fields. ALWAYS include city + state when the user
   mentions a location (drives timezone), and ALWAYS include the
   industry words verbatim in business_description (drives CRM
   personality + pipeline stages):
   \`\`\`
   create_workspace({
     name: "Pacific Coast Heating & Air",
     phone: "(555) 123-4567",
     city: "San Diego",
     state: "CA",
     business_description: "Family-owned residential HVAC contractor — heating, cooling, AC repair.",
     services: [
       { name: "AC Repair" },
       { name: "Heating Installation" },
       { name: "Indoor Air Quality" }
     ]
   })
   \`\`\`
   The response is a guardrail payload — its top field is a giant
   "DO NOT DISPLAY" warning string and the URLs live under
   \`_pending_after_email\`. Do NOT present anything from this
   response to the operator. Move directly to step 3.

3. **Ask the operator for their email — VERBATIM.** Use exactly this
   wording so the operator understands why it's needed:
   > "What email should I use for your account? This is where
   > you'll get your login link and any notifications."
   If the operator declines or asks to skip, explain that the email
   is required to keep their admin login alive past 7 days — then
   ask again. Don't move on without an answer.

4. **MANDATORY: call \`finalize_workspace({ email })\`.** This is the
   one tool call that closes the loop:
   \`\`\`
   finalize_workspace({ email: "max@precisionplumbing.com", name: "Max" })
   \`\`\`
   It sends the welcome email (with all the URLs), captures the
   operator as a lead in our CRM, and returns a \`summary\` field
   with the formatted final output. PARAPHRASE that summary
   verbatim to the operator — that's how they see what was
   configured (CRM personality, pipeline stages, live URLs,
   admin link, email confirmation).

   Alternative: call \`collect_operator_email({ email })\` if you
   want finer control without the formatted summary. Either tool
   satisfies step 4; skipping both does not.

After step 4 the operator can customize their workspace through
further natural-language requests ("change the headline to …",
"add an FAQ section", "set up an industry template for plumbing")
— each routes to a typed MCP tool.

---

## What the tools do (operator language only)

- **\`create_workspace\`** — creates the live business OS (website,
  booking, intake form, CRM, AI agents). Always the first call.
- **\`finalize_workspace\`** — MANDATORY closing call. Bundles email
  collection (welcome email + lead capture) and returns the
  formatted final summary Claude Code paraphrases verbatim to the
  operator. Always the last call of every workspace creation flow.
- **\`collect_operator_email\`** — same effect as finalize_workspace
  but without the formatted summary. Use either; never skip both.
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

export const FIRST_CALL_BANNER = `🚀 SeldonFrame is connected. Ready to create a live business OS — every URL the create_workspace tool returns is real and works in any browser within seconds. NEVER create local files; always use the MCP tools. EVERY workspace creation flow must end with finalize_workspace({ email }) so the operator gets their welcome email + admin login — skipping it is a broken flow.`;
