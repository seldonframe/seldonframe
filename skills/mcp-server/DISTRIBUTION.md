# Distribution — Phase 1 handoff

How to submit `@seldonframe/mcp` to the five Phase 1 distribution
channels. Most steps are automated; the only interactive bits are
GitHub-OAuth device flow for the MCP Registry and pasting URLs into
two web forms.

Pre-flight: `@seldonframe/mcp@1.45.1` is published to npm with the
`mcpName: "io.github.seldonframe/seldonframe-mcp"` property, this
directory ships `server.json` + `smithery.yaml`, and the README +
package metadata are in the agency-buyer voice. Phase 0 is complete.

---

## 1. Official MCP Registry — `mcp-publisher` CLI

**Why first:** PulseMCP auto-ingests from the Registry within ~1 week,
so this single submission also covers channel #4. The Registry is
also what GitHub Copilot, Cursor, Claude Code, and most MCP clients
query for server discovery.

### One-time install (Windows PowerShell)

```powershell
$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"
tar xf mcp-publisher.tar.gz mcp-publisher.exe
rm mcp-publisher.tar.gz
# Move mcp-publisher.exe to a directory in your PATH (e.g., C:\Users\maxim\bin\)
```

Verify:
```powershell
mcp-publisher --help
```

### Submit

```powershell
cd C:\Users\maxim\CascadeProjects\"Seldon Frame"\skills\mcp-server
mcp-publisher login github
# Visit https://github.com/login/device, enter the code shown, authorize.
mcp-publisher publish
```

Expected output:
```
Publishing to https://registry.modelcontextprotocol.io...
✓ Successfully published
✓ Server io.github.seldonframe/seldonframe-mcp version 1.45.1
```

### Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=seldonframe"
```

The response JSON should include `"name":"io.github.seldonframe/seldonframe-mcp"`.

### Troubleshoot

| Error | Fix |
|---|---|
| `Registry validation failed for package` | The `mcpName` in package.json must equal the `name` in server.json. Both are `io.github.seldonframe/seldonframe-mcp`. The npm-published version must equal the server.json version. |
| `You do not have permission to publish this server` | The GitHub account you authenticated with must own the `seldonframe` org (or be a member with publish permissions). |
| `Invalid or expired Registry JWT token` | Re-run `mcp-publisher login github`. |

---

## 2. ~~`modelcontextprotocol/servers` README PR~~ — obsolete

The README of that repo no longer maintains a community/third-party
list. It explicitly directs visitors to the MCP Registry. No PR needed.

---

## 3. MCP.Directory — web form (~60 seconds)

Auto-detects everything from the GitHub repo + npm package.

**Go to:** https://mcp.directory/submit

**Fill in:**

| Field | Value |
|---|---|
| GitHub Repository URL (required) | `https://github.com/seldonframe/seldonframe` |
| npm Package (optional) | `@seldonframe/mcp` |
| Short Description (optional) | *Leave empty — the form will pull from the npm description, which is already agency-positioned.* |
| Your Email (optional) | `hello@seldonframe.com` *(to get notified when it goes live)* |

Submit. Listing appears within 24 hours per their stated SLA.

---

## 4. PulseMCP — automatic, then optional curator note

PulseMCP ingests entries from the Official MCP Registry **daily** and
processes them **weekly**. So:

- **Day 0:** Submit to MCP Registry (step 1).
- **Day 1-7:** PulseMCP picks up the entry automatically. No action.

If the listing hasn't appeared after 7 days, email the curator with
adjustments:

**Email to:** the obfuscated email on https://www.pulsemcp.com/submit
*(load that page in a browser; the address is anti-scraper-obfuscated
in the HTML so I can't quote it here verbatim)*

**Suggested subject:** `New listing for SeldonFrame MCP — Phase 1 launch`

**Suggested body:**

> Hi PulseMCP team,
>
> Submitted `io.github.seldonframe/seldonframe-mcp` to the Official
> MCP Registry on [DATE]. Wanted to surface a few things in case it
> helps your team curate the entry:
>
> - **The positioning:** SeldonFrame is the open-source GoHighLevel
>   alternative for agencies. 146+ MCP tools spin up white-labeled
>   client workspaces (CRM, booking, intake, landing pages, AI
>   chatbot, agent archetypes) in minutes — purpose-built for the
>   freelance-and-small-agency segment serving local service
>   businesses.
> - **What's novel for your readers:** thin-harness/fat-skill
>   architecture in the Karpathy sense — agent intelligence lives in
>   markdown skill packs that get smarter as the underlying model
>   improves, not in TS heuristics that decay. The agent archetype
>   library (speed-to-lead, win-back, review-requester,
>   missed-call-text-back, etc.) ships event-triggered automations
>   on a typed SeldonEvent bus.
> - **Live demo:** https://phoenix-ac-air-conditioning-heating-inc
>   .app.seldonframe.com — generated 2026-05-10 from a single
>   Google Maps paste. The chatbot bottom-right books real
>   appointments in `America/Phoenix` time.
> - **Pricing:** Free tier (no credit card), $29/$99 paid plans,
>   AGPL-3.0 self-host.
>
> Happy to write a guest post on the architecture if it'd be useful
> for your newsletter. Either way, thanks for what you all do for
> the MCP ecosystem.
>
> — Maxime Houle, SeldonFrame

---

## 5. Smithery — repo + form

Two steps:

1. **Already done:** `skills/mcp-server/smithery.yaml` ships in the
   repo. It declares stdio transport, optional `seldonframeApiKey`,
   and a `commandFunction` that invokes `npx -y @seldonframe/mcp@latest`.

2. **Submit on https://smithery.ai:**
   - Sign in with GitHub
   - Click "Add server" (or equivalent)
   - Paste GitHub URL: `https://github.com/seldonframe/seldonframe`
   - Smithery prompts for the path to `smithery.yaml`. Enter:
     `skills/mcp-server/smithery.yaml`
   - Confirm. Smithery builds the entry from the YAML.

Listing should appear at:
`https://smithery.ai/server/io.github.seldonframe/seldonframe-mcp`

---

## After Phase 1

Once the Registry submission lands and the listings appear on
MCP.Directory, PulseMCP, and Smithery, the next moves are:

- **mkinf** (priority #5) — submit at https://mkinf.io/submit, same
  form-based flow as MCP.Directory.
- **Awesome MCP lists** — 2-3 PRs to `awesome-mcp-servers` style
  repos. Each is one bullet point.
- **AlternativeTo** — list against GoHighLevel, Jobber,
  HousecallPro, ServiceTitan, Wix Business Solutions. Slow-burn SEO.
- **Reddit r/gohighlevel value-add commenting** — start NOW; ramp
  after Twilio test produces a real case-study screenshot.

Defer until after the next-week Twilio test produces a real proof
artifact:

- **Product Hunt launch** (gated on screenshots + 3-5 testimonials)
- **Hacker News Show HN** (gated on the companion blog post)
- **Claude marketplace outreach** (gated on Registry-listed status)
