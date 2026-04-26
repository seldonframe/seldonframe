// Curated MCP server directory for SeldonFrame's ICP (SMB operators).
// Source of truth — the docs page imports from here and the README links
// to the live page. Update this file when servers ship/move/break.
//
// Verification policy (per claude/mcp-discovery brief):
// - "verified" = official MCP from the vendor AND active maintenance
// - "community" = community-maintained, real, recent (no first-party MCP)
// - "experimental" = early preview, not production-ready
//
// Last research pass: 2026-04-26.

export type McpStatus = "verified" | "community" | "experimental";
export type McpTransport = "stdio" | "http" | "sse" | "stdio + http" | "stdio + sse";

export type McpCategoryId =
  | "communication"
  | "crm"
  | "productivity"
  | "payments"
  | "marketing"
  | "analytics"
  | "infrastructure"
  | "industry";

export interface McpCategory {
  id: McpCategoryId;
  title: string;
  blurb: string;
}

export interface McpServer {
  /** Display name. */
  name: string;
  /** Category bucket — controls grouping on the page. */
  category: McpCategoryId;
  /** Canonical repo or vendor docs URL. */
  repo: string;
  /** Status badge driver. */
  status: McpStatus;
  /** Transport mechanism advertised by the server. */
  transport: McpTransport;
  /** One-line auth summary. */
  auth: string;
  /** ≤ 12-word description. */
  description: string;
  /** Specific concrete use case for an SMB operator on SeldonFrame. */
  useCase: string;
  /** Optional gotcha / caveat. */
  notes?: string;
}

export const MCP_CATEGORIES: McpCategory[] = [
  {
    id: "communication",
    title: "Communication & Messaging",
    blurb: "Reach customers and your team via SMS, email, and chat.",
  },
  {
    id: "crm",
    title: "CRM & Customer Data",
    blurb: "Sync contacts, deals, and pipeline state with the CRM you already pay for.",
  },
  {
    id: "productivity",
    title: "Productivity & Workspace",
    blurb: "Read and write the docs, calendars, and databases your team lives in.",
  },
  {
    id: "payments",
    title: "Payments & Finance",
    blurb: "Charge customers, reconcile invoices, and pull financial state into agent flows.",
  },
  {
    id: "marketing",
    title: "Marketing & Social",
    blurb: "Schedule posts, manage ads, and run email campaigns from automations.",
  },
  {
    id: "analytics",
    title: "Data & Analytics",
    blurb: "Query product, marketing, and behavioral analytics in plain English.",
  },
  {
    id: "infrastructure",
    title: "Development & Infrastructure",
    blurb: "Manage repos, deploys, and databases without leaving chat.",
  },
  {
    id: "industry",
    title: "Industry-Specific",
    blurb: "Location, weather, and booking primitives for service businesses.",
  },
];

export const MCP_SERVERS: McpServer[] = [
  // ── Communication & Messaging ────────────────────────────────────────
  {
    name: "Twilio",
    category: "communication",
    repo: "https://github.com/twilio-labs/mcp",
    status: "verified",
    transport: "stdio",
    auth: "API key (TWILIO_ACCOUNT_SID + TWILIO_API_KEY:TWILIO_API_SECRET)",
    description: "Exposes the full Twilio API surface as MCP tools.",
    useCase:
      "Send appointment-reminder SMS from a SeldonFrame booking automation and route inbound replies into a CRM contact thread.",
    notes:
      "Published as @twilio-alpha/mcp on npm — still labelled alpha. Use --services/--tags filters to keep tool surface manageable.",
  },
  {
    name: "Resend",
    category: "communication",
    repo: "https://github.com/resend/resend-mcp",
    status: "verified",
    transport: "stdio + http",
    auth: "API key (RESEND_API_KEY)",
    description: "Send transactional and broadcast emails via Resend.",
    useCase:
      "Trigger order-confirmation, lead-followup, and onboarding emails from automation steps without standing up your own SMTP.",
  },
  {
    name: "Slack",
    category: "communication",
    repo: "https://docs.slack.dev/ai/slack-mcp-server/",
    status: "verified",
    transport: "http",
    auth: "OAuth 2.0 (confidential client)",
    description: "Hosted Slack MCP — search, post, manage canvases and users.",
    useCase:
      "Post a notification to #new-leads and DM the deal owner the moment SeldonFrame's CRM marks a deal as Won.",
    notes: "Hosted by Slack at mcp.slack.com — workspace admin must approve the app.",
  },
  {
    name: "Discord",
    category: "communication",
    repo: "https://github.com/IQAIcom/mcp-discord",
    status: "community",
    transport: "stdio + http",
    auth: "Bot token (DISCORD_TOKEN)",
    description: "Discord bot operations — channels, messages, forums, webhooks.",
    useCase:
      "Run a paid-course community and let SeldonFrame post drip-content announcements or auto-reply to common member questions.",
    notes: "No first-party Discord MCP exists. Requires creating a Discord app + bot with the right intents.",
  },

  // ── CRM & Customer Data ──────────────────────────────────────────────
  {
    name: "HubSpot",
    category: "crm",
    repo: "https://developers.hubspot.com/mcp",
    status: "verified",
    transport: "http",
    auth: "OAuth 2.0 (moving to 2.1 with PKCE)",
    description: "Hosted HubSpot MCP with read/write access to CRM records.",
    useCase:
      "Sync a SeldonFrame intake-form submission into HubSpot as a contact + deal, then let the brain draft the follow-up email.",
    notes: "Public beta. Two distinct servers exist — this is the CRM one (separate Developer Platform MCP also exists).",
  },
  {
    name: "Salesforce",
    category: "crm",
    repo: "https://github.com/salesforcecli/mcp",
    status: "verified",
    transport: "stdio",
    auth: "Salesforce CLI org auth (`sf org login web`)",
    description: "Official Salesforce MCP for org metadata, SOQL/Apex, and dev workflows.",
    useCase:
      "Query open opportunities by SOQL and push SeldonFrame's next-best-action recommendations back as Tasks on the rep's queue.",
    notes:
      "CLI-server is dev-tooling-flavoured. Salesforce's Hosted MCP Servers offering (currently beta, GA targeted Feb 2026) is cleaner for non-technical SMBs.",
  },
  {
    name: "Attio",
    category: "crm",
    repo: "https://github.com/kesslerio/attio-mcp-server",
    status: "community",
    transport: "stdio",
    auth: "API key (ATTIO_API_KEY) or OAuth (ATTIO_ACCESS_TOKEN)",
    description: "Comprehensive MCP for Attio — People, Companies, Deals, Lists, Tasks, Notes.",
    useCase:
      "Enrich a new Attio Person with web context, log a call note, and add the deal to a 'Q2 pipeline' list automatically.",
    notes: "No first-party MCP yet. kesslerio's wrapper exposes 35 tools with proper safety annotations.",
  },

  // ── Productivity & Workspace ────────────────────────────────────────
  {
    name: "Google Workspace",
    category: "productivity",
    repo: "https://github.com/taylorwilsdon/google_workspace_mcp",
    status: "community",
    transport: "stdio + http",
    auth: "Google OAuth 2.0 (your own client credentials)",
    description: "Gmail, Drive, Calendar, Docs, Sheets, Slides, Tasks via one MCP.",
    useCase:
      "Draft Gmail replies to inbound leads, drop signed contracts into Drive, and book the kickoff onto the owner's Calendar.",
    notes: "Most feature-complete option — Google has not shipped a first-party MCP. MIT-licensed, multi-user OAuth.",
  },
  {
    name: "Notion",
    category: "productivity",
    repo: "https://github.com/makenotion/notion-mcp-server",
    status: "verified",
    transport: "stdio + http",
    auth: "Integration token (NOTION_TOKEN) or OAuth (remote)",
    description: "Read and write Notion docs, wikis, and data sources.",
    useCase:
      "Sync deal notes from your CRM into the team's Notion ops wiki, or pull SOPs into agent context for support tickets.",
    notes: "v2 migrated databases → 'data sources' (2025-09-03 API). Hosted remote at mcp.notion.com.",
  },
  {
    name: "Linear",
    category: "productivity",
    repo: "https://linear.app/docs/mcp",
    status: "verified",
    transport: "http",
    auth: "OAuth 2.1 with dynamic client registration",
    description: "Find, create, and update Linear issues, projects, and comments.",
    useCase:
      "When a SeldonFrame intake form captures a bug from a paying customer, file it as a Linear issue with the customer's plan tier attached.",
    notes:
      "Hosted-only. Add via `claude mcp add --transport http linear-server https://mcp.linear.app/mcp`.",
  },
  {
    name: "Airtable",
    category: "productivity",
    repo: "https://github.com/domdomegg/airtable-mcp-server",
    status: "community",
    transport: "stdio + http",
    auth: "Personal access token (AIRTABLE_API_KEY)",
    description: "Inspect schemas and read/write records across Airtable bases.",
    useCase:
      "Pull live inventory or property availability from a customer's Airtable into a generated quote — without leaving chat.",
    notes: "No first-party MCP. domdomegg's is the de-facto standard (440+ stars, MIT, actively versioned).",
  },

  // ── Payments & Finance ──────────────────────────────────────────────
  {
    name: "Stripe",
    category: "payments",
    repo: "https://github.com/stripe/agent-toolkit",
    status: "verified",
    transport: "stdio + http",
    auth: "Restricted API key (STRIPE_SECRET_KEY, prefer rk_*) or OAuth (remote)",
    description: "Charge customers, manage subscriptions, and search Stripe docs.",
    useCase:
      "Charge a deposit when a deal moves to 'won', then auto-create the recurring subscription and reconcile its status onto the contact.",
    notes: "Use restricted keys, not your live secret. Remote MCP at mcp.stripe.com.",
  },
  {
    name: "QuickBooks Online",
    category: "payments",
    repo: "https://github.com/intuit/quickbooks-online-mcp-server",
    status: "experimental",
    transport: "stdio",
    auth: "OAuth 2.0 (CLIENT_ID/SECRET/REFRESH_TOKEN/REALM_ID)",
    description: "143 tools covering 29 QBO entities and 11 financial reports.",
    useCase:
      "After a Stripe payment lands, post the matching invoice into QuickBooks and pull a P&L snapshot when the owner asks 'how was March?'",
    notes: "Intuit early-preview (Oct 2025). Few commits, no tagged release. US-only QBO. Pilots only — not production.",
  },
  {
    name: "Square",
    category: "payments",
    repo: "https://github.com/square/square-mcp-server",
    status: "community",
    transport: "stdio + sse",
    auth: "Access token (local) or OAuth (remote)",
    description: "Auto-generated MCP wrapper over Square's REST APIs (POS, payments, catalog).",
    useCase:
      "A retail SMB pushes a new product into the Square catalog and pulls yesterday's POS totals into a daily ops digest.",
    notes: "Officially published by Square but explicitly Beta and slow-moving (last release April 2025). Use the remote OAuth endpoint in production.",
  },

  // ── Marketing & Social ──────────────────────────────────────────────
  {
    name: "Postiz",
    category: "marketing",
    repo: "https://github.com/antoniolg/postiz-mcp",
    status: "community",
    transport: "stdio",
    auth: "API key (POSTIZ_API_KEY)",
    description: "Schedule and manage social posts via Postiz API.",
    useCase:
      "Schedule weekly recap posts across X, LinkedIn, and Instagram from a single workflow without leaving chat.",
    notes: "Postiz itself is open-source but has no first-party MCP yet. antoniolg's wrapper is the most complete community option.",
  },
  {
    name: "Mailchimp",
    category: "marketing",
    repo: "https://github.com/damientilman/mailchimp-mcp-server",
    status: "community",
    transport: "stdio",
    auth: "API key (MAILCHIMP_API_KEY in `<key>-<dc>` format)",
    description: "53 tools for Mailchimp audiences, campaigns, automations.",
    useCase:
      "Pull last campaign's open/click rates and draft a follow-up to non-openers without opening the Mailchimp dashboard.",
    notes: "No official Mailchimp MCP. damientilman has the broadest tool coverage; AgentX-ai/mailchimp-mcp is read-only if write access is a concern.",
  },
  {
    name: "Google Ads",
    category: "marketing",
    repo: "https://github.com/google-marketing-solutions/google_ads_mcp",
    status: "verified",
    transport: "stdio",
    auth: "OAuth 2.0 via google-ads.yaml",
    description: "Google's official MCP server for the Google Ads API.",
    useCase:
      "Ask 'which campaigns blew their budget last week and what was their CPA?' before the Monday team sync.",
    notes: "Read-only by design (no bid edits, pause, or asset creation). Marked 'experimental, unsupported' by Google despite being maintained by them.",
  },
  {
    name: "Meta Ads",
    category: "marketing",
    repo: "https://github.com/pipeboard-co/meta-ads-mcp",
    status: "community",
    transport: "stdio + http",
    auth: "OAuth via Pipeboard or direct Meta token",
    description: "Manage Meta ads across Facebook, Instagram, and Audience Network.",
    useCase:
      "Pause underperforming Instagram ad sets and reallocate budget to top-CTR creatives mid-week without logging into Ads Manager.",
    notes: "819 stars, 137 releases — most mature option. For organic Instagram (not ads), pair with jlbadano/ig-mcp.",
  },

  // ── Data & Analytics ────────────────────────────────────────────────
  {
    name: "Google Analytics",
    category: "analytics",
    repo: "https://github.com/googleanalytics/google-analytics-mcp",
    status: "verified",
    transport: "stdio",
    auth: "OAuth 2.0 (analytics.readonly scope)",
    description: "Google's official GA4 MCP for reports and admin.",
    useCase:
      "Ask 'top 5 landing pages for organic traffic last 30 days, and where did conversions drop off?' without building a dashboard.",
    notes: "Read-only. Requires Python 3.10+ and a GCP project for the OAuth client.",
  },
  {
    name: "Amplitude",
    category: "analytics",
    repo: "https://github.com/amplitude/mcp-server-guide",
    status: "verified",
    transport: "http",
    auth: "OAuth 2.0 (respects existing Amplitude permissions)",
    description: "Query Amplitude charts, dashboards, cohorts, and experiments.",
    useCase:
      "Ask 'which onboarding step has the highest drop-off this month, and which user cohort is affected?' without owning a data team.",
    notes: "Hosted at mcp.amplitude.com/mcp (US) or mcp.eu.amplitude.com/mcp (EU). Read + write (chart/cohort creation).",
  },
  {
    name: "Mixpanel",
    category: "analytics",
    repo: "https://docs.mixpanel.com/docs/mcp",
    status: "verified",
    transport: "http",
    auth: "OAuth 2.0 with PKCE (S256), dynamic client registration",
    description: "Query Mixpanel events, funnels, retention, replays.",
    useCase:
      "Ask 'show me the funnel from signup to first paid action for users from last week's LinkedIn campaign' in plain English.",
    notes: "Three regional endpoints (US, EU, IN). For event ingestion (writing tracking events), use community dragonkhoi/mixpanel-mcp.",
  },

  // ── Development & Infrastructure ────────────────────────────────────
  {
    name: "GitHub",
    category: "infrastructure",
    repo: "https://github.com/github/github-mcp-server",
    status: "verified",
    transport: "stdio + http",
    auth: "OAuth (remote) or Personal Access Token (local)",
    description: "Manage repos, issues, PRs, and code search via the GitHub API.",
    useCase:
      "Auto-file customer-reported bugs from a SeldonFrame intake form into the right GitHub repo and assign the on-call engineer.",
    notes: "Co-developed by GitHub and Anthropic; rewritten in Go. Use scoped PATs.",
  },
  {
    name: "Vercel",
    category: "infrastructure",
    repo: "https://vercel.com/docs/agent-resources/vercel-mcp",
    status: "verified",
    transport: "http",
    auth: "OAuth 2.1 (per latest MCP authorization spec)",
    description: "Manage Vercel projects, deployments, and logs from an AI client.",
    useCase:
      "Promote a customer-portal preview deploy to production after a sales rep approves the new copy in chat.",
    notes: "Hosted at mcp.vercel.com. Only Vercel-approved AI clients can connect (Claude, ChatGPT, Cursor, Codex).",
  },
  {
    name: "Supabase",
    category: "infrastructure",
    repo: "https://github.com/supabase-community/supabase-mcp",
    status: "verified",
    transport: "stdio + http",
    auth: "OAuth 2.1 via dynamic client registration",
    description: "Manage Supabase projects, schemas, SQL queries, and config.",
    useCase:
      "Spin up a dev branch off the production DB to safely test a new pricing-table migration before merging.",
    notes: "Maintained by Supabase. Docs strongly advise pointing at a dev project, not production.",
  },
  {
    name: "Neon",
    category: "infrastructure",
    repo: "https://github.com/neondatabase-labs/mcp-server-neon",
    status: "verified",
    transport: "stdio + http",
    auth: "OAuth (remote) or API key (local)",
    description: "Create projects, branches, run SQL, and migrate Postgres schemas.",
    useCase:
      "Branch the customer database per agent test, run a destructive automation, then drop the branch — no impact on prod.",
    notes: "Hosted at mcp.neon.tech/mcp. Vendor recommends local-dev/IDE only.",
  },

  // ── Industry-Specific ───────────────────────────────────────────────
  {
    name: "Google Maps / Places",
    category: "industry",
    repo: "https://github.com/cablate/mcp-google-map",
    status: "community",
    transport: "stdio",
    auth: "Google Maps API key (Places API New + Routes API enabled)",
    description: "Geocode addresses, search places, compute distance and routes.",
    useCase:
      "Geocode an inbound HVAC service request and route the nearest available technician based on travel time, not straight-line distance.",
    notes:
      "Anthropic's reference MCP for Google Maps was archived in May 2025. cablate's community fork is the most-cited replacement.",
  },
  {
    name: "Weather (OpenWeatherMap)",
    category: "industry",
    repo: "https://github.com/robertn702/mcp-openweathermap",
    status: "community",
    transport: "stdio",
    auth: "OpenWeatherMap API key",
    description: "Current weather, forecasts, and air quality via OpenWeatherMap.",
    useCase:
      "Trigger an automation that texts HVAC customers a heat-advisory pre-check the morning before a forecast 95°F+ day.",
    notes: "For US-only outdoor services, the National Weather Service quickstart server is free and key-less.",
  },
  {
    name: "Calendly",
    category: "industry",
    repo: "https://developer.calendly.com/calendly-mcp-server",
    status: "verified",
    transport: "http",
    auth: "OAuth 2.1 + PKCE with Dynamic Client Registration (RFC 7591)",
    description: "Schedule meetings, manage event types, invitees, and reminders.",
    useCase:
      "When a deal hits 'qualified', auto-send the customer a Calendly link for the right rep's discovery-call event type.",
    notes: "Hosted at mcp.calendly.com. No self-host or local mode.",
  },
  {
    name: "Cal.com",
    category: "industry",
    repo: "https://github.com/calcom/cal.com",
    status: "verified",
    transport: "stdio + http",
    auth: "OAuth 2.1 (hosted) or API key (local)",
    description: "Open-source booking — manage events, schedules, team availability.",
    useCase:
      "Confirm a salon booking and reschedule it across two stylists' shared availability — without proprietary lock-in.",
    notes: "34 tools across the Cal.com Platform API v2. Hosted at mcp.cal.com/mcp.",
  },
];
