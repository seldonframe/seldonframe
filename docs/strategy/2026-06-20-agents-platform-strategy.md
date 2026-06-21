# SeldonFrame Strategy — From "AI Front Office" to "Platform for Building & Selling Agents"

**Date:** 2026-06-20
**Status:** Strategy for review (no implementation yet)
**Builds on:** the Shopify deep-research + reflection (memory `seldonframe-shopify-vision`)

## 0. Thesis & where we are in the cycle

**Non-consensus bet:** *As LLMs get better and AI goes mainstream, millions will want to start AI-agent businesses — and the winner won't be the best agent. It'll be the Shopify underneath them all.* Everyone is racing to build **the** agent; almost nobody is building the **infrastructure for everyone else to sell agents.** Yin to the yang — agent gold rush → agent picks-and-shovels (Amazon→Shopify, PayPal→Stripe).

**Antifragile to better models:** a thin harness rides every model gain for free, and each capability jump *grows* the pool of would-be builders. Caveat: *fat skills are a transient moat* (good-enough models absorb some). The durable moat is what no model commoditizes — **distribution, billing rails, the customer relationship, the marketplace network** (Shopify owns checkout + distribution, not HTML). Make those the moat; let skills be the wedge. The thin harness also makes you **Switzerland** — best model wins inside you — which model vendors structurally can't be.

**Cycle position:** *middle-stage* on AI-ops-for-SMBs (GoHighLevel proved it and got complex → our yin is AI-native simplicity); *early-stage* on build-&-sell-agents (nobody owns it yet).

**Hair-on-fire (ICP 3, now):** the "AI automation agency" wave duct-tapes Vapi + Make + GHL + Stripe + hosting + a calendar to ship one agent to one client, then drowns in multi-tenancy + billing. Our 10x: **ship a sellable, rented agent in an afternoon and get paid — without becoming a systems integrator.**

## 1. The shift
**Today:** SeldonFrame gives an *existing* service business its own AI front office — site + CRM + booking + intake + agents. The user **is** the end-operator and uses the whole suite.

**The expansion:** SeldonFrame becomes the **infrastructure to build and sell agents & services to other businesses** — *without* forcing those businesses onto the full suite. The user becomes a **builder/vendor**; their clients simply receive the value (calls answered, reviews requested, emails handled, FAQs answered).

This is the Shopify arc maturing. Shopify isn't "a store for your products" — it's "infrastructure to build a commerce business." SeldonFrame becomes **"infrastructure to build an AI-services business."** The builder is the merchant; their clients are the customers; SeldonFrame is the rails — and takes a cut.

## 2. The one architectural unlock: decouple Agent from Workspace
Today, deploying an agent effectively means creating a workspace. **The entire expansion rests on making an agent a standalone, embeddable, billable unit** that runs for a client who has no workspace, no CRM, no SeldonFrame site.

**New core primitive — the Deployable Agent** (a sellable "Agent Product"):
- Built on existing agent infra (voice / chat / email / review-requester / FAQ-from-knowledge).
- Runs against the **client's own tools** — their calendar (cal.diy → *any* calendar), their inbox (OAuth), their phone number — not a SeldonFrame workspace.
- **Rented, never sold outright.** The builder rents *access* — per-usage **or** fixed/subscription (**no outcome pricing**); SeldonFrame hosts and runs the agent; money flows **customer → builder → SeldonFrame's cut**. Selling the agent as a self-hosted artifact is explicitly rejected: it kills recurring GMV, freezes the agent so it *rots* as models improve, and surrenders the data/relationship moat. A rented agent compounds with every model upgrade; a sold one decays.
- Deploys via one of three surfaces:
  1. **Embed** — a chat-widget snippet or review-request link the client drops on their site / receives as a link.
  2. **Phone number** — a voice agent; the client just gets a number that answers and books.
  3. **MCP / API endpoint** — the agent is callable per-usage by other systems and **other agents** (the agent-to-agent piece).
- Backed by a **lite tenant**: a minimal client record holding only the agent + its conversations + (optionally) the cal.diy/email connection. No workspace, CRM, or site.

**Your examples, mapped:**

| Builder sells | Runs against | Deploys as |
|---|---|---|
| Voice agent for a hairdresser | their calendar (cal.diy → any calendar) | phone number + cal.diy |
| Review requester for a contractor | a "job done" trigger | SMS sender + trigger |
| FAQ/voice agent for a coach | the course content (knowledge base) | phone/chat + KB |
| Email agent (replies in the owner's voice) | their inbox (OAuth) | email connection + persona |

None require the client to log into a SeldonFrame workspace.

## 3. One ICP, one price (revised 2026-06-21)

The three "actors" are **one persona at different scale — the service operator**: anyone who delivers a service, or builds an agent that delivers one, and needs to *run it, get paid, and (optionally) sell what they built* to others. A solo plumber and a 50-client agency are the same primitive — the agency just runs more workspaces and resells. (Shopify treats a solo store and a Plus agency as one product that scales; same here.) The old $19/$49/$297 split is **retired**.

| Was | Now |
|---|---|
| Operator $19 / Builder $49 / Agency $297 | **$29/mo flat · unlimited workspaces · 14-day free trial** |

- **$29/mo flat** — the "run your business" floor; captures value from everyone whether or not they sell agents. Undercuts GHL ($97–$497) and bundles more than Shopify.
- **Unlimited workspaces** — agencies are just power users running many; we deliberately *don't* meter workspaces (nobody else gives this flat) because the money is the GMV cut, not seat-counting.
- **14-day trial → $29** — an SMB usually runs one workspace; the agency runs many at the same flat price.

Messaging stays uniform because the product *is* uniform: **build it, run it, sell it.** What differs is only *what* they sell — a service to consumers, front offices to other operators, or rented agents to businesses — not the product or the price. An agent-builder is effectively a micro-SaaS founder; SeldonFrame is their entire backend (hosting + multi-tenancy + Stripe).

## 4. Monetization (finalized 2026-06-21 — BYO economics)

Committing to **BYOK + BYO-Twilio** (the builder brings their own LLM key *and* their own Twilio account — the Vapi model) simplified the model hard. SeldonFrame becomes pure rails — **build, test, eval, host, log, deploy, rent** — and **COGS → ~zero**: no token cost, no telephony float, **no A2P liability** (the builder's Twilio account holds the brand/campaign/numbers). This *deletes* the usage-metering-markup engine and the subaccount/wallet/A2P-ISV machinery — you don't resell usage you don't carry.

**Three things the user pays for, nothing else:**
1. **$29/mo flat to run** (14-day trial, unlimited workspaces) — the floor, from everyone.
2. **GMV cut — 5% → 3% over $10k/mo → 2% over $50k/mo** — *only* when SeldonFrame is the **sales channel**: a builder sells or rents an agent (or a whole workspace) to *another* business through SeldonFrame Connect. **Not** on the operator's own service revenue (that's just payment passthrough). Declining band = retention for the big builders who could most afford to leave. Flip the dormant Connect `application_fee` (proposals rail).
3. **Marketplace usage fee** — a builder lists an agent on the marketplace; other agents/builders buy it per-usage; SeldonFrame takes its GMV cut on each cross-agent call. (Built on the MCP layer — see next section.)

**Usage = $0 to us** (BYO keys; providers bill the builder directly). "We don't tax your usage" is a weapon vs GHL's rebill-markup. *Managed-key remains an optional path for SMBs not comfortable with BYOK — then #139 metering applies — but BYO is the default.*

The principle in one breath: **we don't tax your work — flat to run, free to start, a cut only when we help you *sell* something new.** Structurally simpler and more aligned than GHL (profits on complexity + usage markup), Vapi (per-minute platform fee), or Shopify (taxes your own product sales).

> *Trade-off:* BYO-Twilio adds onboarding friction (connect Twilio) vs an instant number — but it fits **progressive disclosure**: first-run (site/booking/CRM/chatbot) needs no key; telephony is disclosed when the builder reaches for a phone agent, and the rails automate the setup so it still feels magical. (This also simplifies the telephony spec to "builder connects their own Twilio.")

## 4b. The MCP connector directory + agents-as-MCP-servers marketplace (added 2026-06-21)

**The product:** on the agent-builder page, a searchable/scrollable **connector directory** — a built-in Zapier-for-agents — where a builder finds a tool and connects it to their agent **via MCP**. SeldonFrame is already MCP-native (it *is* an MCP server); this adds the **client** side (agents consuming other MCP servers).

**Complexity, honestly** (grounded in the codebase): agents today use a fixed `capabilities` allowlist on `AgentBlueprint` → a tool registry → injected into the runtime/voice loops. To add user-selectable MCP tools:
- *Catalog + search UI* — **Low** (bootstrap by syncing a public MCP registry: Smithery / mcp.so / PulseMCP / the official registry).
- *Store the connection per agent* (`mcpConnections[]` on the blueprint) — **trivial** (this is the "just store it" part).
- *Runtime MCP client* (connect → `listTools` → merge into the existing tool bridge) — **Medium**; new muscle (we're a server, not a client today), but the MCP SDK does the protocol.
- *Per-tool auth* — **the real work.** API-key/token servers = easy (reuse `encryptValue`); **OAuth is the hard part**, and it collapses to essentially **Google + Microsoft + Slack** (everything else has an API-key or paste-a-token path).

**The native-coverage unlock (integration Pareto, researched 2026-06-21):** SeldonFrame *already* natively owns **6 of the highest-frequency categories** — booking (cal.diy), transactional email (Resend), SMS/voice (Twilio), CRM (built-in), payments (Stripe Connect), intake (Formbricks). That neutralizes most must-have OAuth integrations. The user's hypothesis holds: **cal.diy covers the *booking* job, so Google Calendar drops to nice-to-have** (only needed for two-way busy/free *sync*).

**v1 build shortlist (max capability per unit of auth engineering):**
- **(a) Wrap native as MCP tools** — booking / payments / email / SMS / CRM / intake (skip external connectors for these).
- **(b) Easy API-key wins (add now):** web search/scrape (Tavily / Brave / Firecrawl — highest ROI; native has none), Mailchimp (the campaign/list gap Resend doesn't fill), Airtable (PAT), Notion (internal-token path), Slack incoming-webhook (≈70% of Slack value — alerts — with zero OAuth).
- **(c) OAuth, only where a native bridge can't reach:** a **single Google Workspace OAuth client** unlocks Gmail-read + Sheets + Docs + Drive in one flow — the best OAuth investment *if* you need inbox/docs. **But calendar is no longer on this list:** cal.diy is the **universal calendar adapter** — the agent always books via cal.diy, and cal.diy bridges to the client's existing Google/Outlook/Apple calendar via **CalDAV or a webhook automation — no Google OAuth to build** (CalDAV has client-side app-password/2FA friction + Google is deprecating it in places, so the webhook/automation path is the more robust default). **Principle: prefer a native abstraction that bridges outward (cal.diy ↔ CalDAV/webhook) over building per-provider OAuth.** Defer Microsoft / full-Slack / HubSpot-OAuth to v2 by demand.

With native (a) + ~4 API-key connectors (b) + (only if inbox/docs are needed) one Google OAuth (c), a builder's agent does an estimated **~95% of what service-business users actually want**, with calendar — the highest-frequency need — covered by cal.diy with **zero OAuth**.

**Two integration surfaces (don't conflate):** (A) the **builder's own workspace** — native fully covers it; (B) the **agent deployed to a client** — it acts on the *client's* business, so it binds to the *client's* tools. Tools bind at two levels: the **template** declares capability *types* (book / CRM-log / SMS), and each **deployment** binds them to that client's *actual accounts* — **native default** (auto-provision cal.diy + lite CRM for a client with no stack) **or BYO** (the client's own calendar via cal.diy's CalDAV/webhook bridge; their own CRM via API-key/MCP). That per-deployment binding is the invisible-multi-tenancy moat.

**The crown jewel — this directory *is* the marketplace.** Make every SeldonFrame agent **exposable as an MCP server**, and "list your agent on the marketplace at a usage fee" = **publish it as an MCP tool other agents can connect to.** The directory then lists third-party servers *and* other builders' SeldonFrame agents side by side, and SeldonFrame becomes **the MCP registry + the billing/metering layer** between them — every cross-agent call is a GMV event (monetization layer 3). This is the "agents become clients of agents" thesis made real. The durable moat isn't the catalog (anyone can sync a registry) — it's being the **trusted, billed exchange**; the ongoing work is auth + **trust/safety** (vetting listed servers, prompt-injection via tool results, scope limits), and that curation *is* the moat.

## 4c. The agent builder: 6 primitives + generate-from-English (added 2026-06-21)

To make building *almost any* agent trivial — **"anybody with an LLM key builds + tests + deploys + sells an agent in minutes"** — factor the builder into **6 orthogonal primitives**. The current voice-receptionist page (`/studio/agents/[id]`) is just these, pre-set for voice:

1. **Surface** — how it's reached: voice · chat-embed · SMS · email · DM · MCP-endpoint.
2. **Skill** — the SKILL.md: persona + playbook (`AgentBlueprint.customSkillMd` + greeting). The fat skill.
3. **Tools** — what it can *do*: native tools (`capabilities` allowlist) + the MCP connector directory (§4b).
4. **Knowledge / Brain** — what it *knows*: FAQ + pricing facts today → **Brain v2 + per-deployment memory** (the Karpathy brain; the part that *compounds*).
5. **Guardrails** — what it must *not* do: the deterministic-vs-LLM boundary (quote-guard, read-back, validators), per agent.
6. **Voice / Format** — TTS voice (voice) / tone + format (text).

**Any agent = Surface + Skill + Tools + Knowledge + Guardrails + Voice.** Maps cleanly onto the locked vision: **thin harness** = one generic runtime over the 6 inputs (rides every model gain for free); **fat skill** = #2 + #3 (forkable + sellable); **Karpathy brain** = #4 (compounds per deployment).

**The unlock — generate the whole bundle from one English sentence.** The user describes intent ("answer my HVAC phone, book jobs, text a quote range, never quote a firm price") and a meta-agent drafts the **entire bundle**: a world-class SKILL.md in SeldonFrame's *house style* (which bakes in the voice-R1 anti-hallucination playbook), the tool selection, proposed guardrails, FAQ stubs, **and the eval tasks that gate deploy** — *"describe it → we write the agent AND its tests."* The user reviews/edits a draft — never a black box. This collapses the hardest part (authoring a good agent) into a sentence, and makes *your* playbook everyone's default = the defensible core.

**Templates** = surface-based presets of the 6 primitives (Voice receptionist · Web chat · SMS · Email · DM), **forkable + sellable** (a customized template → a marketplace listing).

**Flow (build → sell in minutes, ~5 required steps):** Describe → Generate → Review/tweak (optional) → Test (sandbox) → Eval (auto-gate) → Deploy/rent (bind tools: native cal.diy default, or cal.diy bridges to the client's calendar) → List on marketplace (optional).

**First spec slice** = the AI-assisted generalized builder (generate-from-English + the 6-primitive UI + 2–3 templates) on the **existing** chat/voice runtime + native tools — UI/UX-forward. MCP connector directory, Brain v2, new surfaces (email/DM), and per-deployment OAuth are explicit follow-ons. Spec: `docs/superpowers/specs/2026-06-21-ai-assisted-agent-builder-design.md`.

## 5. Phasing (confirmed order)

**Phase 0 — Turn on the money (now; ~90% built).** Finish #139 usage-metering + flip the Connect `application_fee`. No new product surface — pure monetization. Moves you from SaaS-costume to the Shopify engine.

**Phase 1 — Standalone deployable agents.** Decouple agent from workspace: deploy an agent to an external client via embed / phone number / lite-tenant. The "build and sell ONE agent" moment that unlocks *"start your own agents business."* (Biggest new surface.)

**Phase 2 — Sell + bill clients.** Packaging + pricing wrapper + builder→client billing via Connect (the builder becomes a merchant). Finish agency rebill-with-markup ($297).

**Phase 3 — Agent-to-agent + marketplace.** Expose each agent as an MCP/UCP endpoint (callable by other agents per-usage); build the Zapier-for-agents marketplace — discovery, listing, ranking, dev-generous rev-share.

## 6. Have vs Need
**HAVE:** agent infra (`create_agent`, voice receptionist, chatbot, `update_agent_blueprint`), **`export_agent` + `publish_agent`** (portability scaffolding already exists), cal.diy booking, SMS/email, Stripe Connect (proposals), usage-metering in flight (#139), multi-workspace/agency, MCP-native platform.

**NEED:**
- **Lite tenant / standalone deployment** — an agent that runs with no workspace (Phase 1). *The crux.*
- **Agent Product object** — packaging + pricing wrapper, per-usage/fixed (Phase 2).
- **Builder→client billing** — Connect `application_fee` on agent revenue; builder as merchant (Phase 2).
- **Builder console** — "agents I sell" (distinct from "my workspace").
- **Agent-to-agent exposure** — each agent as a metered MCP endpoint + a directory (Phase 3).
- **Marketplace** — listings, discovery, rev-share ledger (Phase 3).

## 7. Open decisions (your call)
1. **Lite-tenant model** — agents-without-a-suite get (a) a truly minimal "agent-only" record **[recommended]**, (b) a hidden full workspace with the UI stripped, or (c) stateless embed/endpoint with data living in the builder's workspace? Shapes everything downstream.
2. **Merchant-of-record for the builder→client charge** — the **builder** (SeldonFrame takes `application_fee`, builder owns the customer) **[recommended — matches Connect Express + the UCP/ACP direction]**, or **SeldonFrame** (simpler UX, but you become a payments business)?
3. **Phase-1 surface to lead with** — phone-number voice agent, embeddable chat widget, or review-requester? **[recommend the voice agent for a hairdresser on cal.diy — most magical, and voice is already battle-tested].**

## 8. What would need to be true

**The world must do 3 things (the secular bets):**
1. Agents get *trusted* with real money-tasks (answer the phone, book jobs, reply to customers) — enough that businesses pay monthly.
2. The long tail of niche agents stays underserved by big vendors (OpenAI won't build "review-requester for Austin roofers"; independent builders will).
3. The solopreneur wave extends from content/commerce into agents (creator economy → agent economy).

**SeldonFrame must own 5 things:**
1. **Standalone deployment** — an agent runs for a client with no SeldonFrame account (Phase 1). Without it, "sell to others" is impossible.
2. **Invisible multi-tenancy** — one builder, hundreds of isolated, separately-billed clients, zero ops. (The exact thing the duct-tapers drown in — making it disappear *is* the 10x.)
3. **The rental runtime** — SeldonFrame hosts + runs the agents reliably against the client's own tools (cal.diy, OAuth, phone numbers), auto-upgrading as models improve.
4. **Frictionless money: customer → builder → SeldonFrame** — builder sets price, gets paid via Connect, SeldonFrame takes a small cut + metered usage; near-zero setup.
5. **A take-rate small enough that builders never want to leave** + (later) a developer-generous marketplace. Greed = they route around you (the anti-Shopify).

**The two bets that actually matter (everything else follows):**
- **In our control — WIN THE BUILDERS.** Win the power users (the AI-automation-agency crowd) and the rest gets easy. If "ship a rented, sellable agent in an afternoon + get paid" is real, they adopt SeldonFrame as their backend and bring their own clients — our CAC becomes *builders*, not end-customers; they do the selling. This is the ICP-3 wedge.
- **Outside our control — DON'T GET ABSORBED.** Existential risk: a model vendor or GoHighLevel ships native "deploy + bill your agent." Defense = the durable moat (distribution + the SMB relationship + billing/data network) **+ multi-vendor neutrality** (a thin harness makes us Switzerland; the model vendors structurally can't be).

**The flywheel:** more builders → more deployed agents → more end-customers + usage/data → better defaults & skills + a marketplace → more builders. **Lock-in:** once a builder's clients + billing + agents live on SeldonFrame, leaving means rebuilding their company (the Shopify lock-in — your store *is* Shopify).

## 9. Why a builder switches (vs Vapi / GHL)
The article's only real test: *why switch from what you already use?*
- **Vapi (Retell, Bland)** = infra for *one modality* (voice). A brick — the builder still stitches billing, multi-tenancy, CRM, hosting, telephony, every non-voice agent. No selling layer.
- **GoHighLevel** = a selling layer but *not agent-native* (CRM/funnel tool with AI bolted on), *forces the SMB into a sub-account*, *locks the AI* (its model + markup, no BYOK), bloated. $397/mo fixed.
- **SeldonFrame** = the whole *business backend for rented agents* (eval, test, host, deploy, sell, bill, brain/memory, telephony) where **the SMB never logs into anything** (standalone deploy) and the builder **keeps their own LLM key + margin** (BYOK, multi-vendor-neutral).

**The 10x switch case** (agent-first builder): fire 5 subscriptions + the glue (Vapi + Make + Stripe wiring + Twilio + hosting), kill the $397/mo fixed cost for **$29 flat + a small %** (no usage tax — BYO keys), keep your LLM margin, sell to SMBs who don't adopt a suite — on infra that rides every model gain instead of locking you to one vendor's AI.

**Who NOT to chase:** happy full-funnel marketing agencies (GHL's funnels/email/courses aren't our surface) and low-level voice devs who want Vapi's knobs. Target **agent-first builders, new entrants, and duct-tapers in pain.** Switching live clients is real friction — win the *next* agent they build; migration follows.

**DIY objection** ("why pay a % forever?"): same reason merchants don't build their own Shopify — multi-tenancy, billing, eval, brain, A2P/telephony, deployment are miserable to build/maintain. Keep the take below the cost+hassle of DIY and they stay.

## 10. Next step
Each phase becomes its own brainstorm → spec → plan. Phase 0 is closest to ready (it's #139 + a Connect flag). Phase 1 (standalone deployable agent) is the real product unlock and where the design work should start. Pick one and it goes into a proper spec.
