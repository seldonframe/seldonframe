# BLOCK: MCP Distribution + Custom Domains (Primary Onboarding)

## Description
Primary way builders discover and use SeldonFrame: via Claude Code MCP skill. Includes one-click custom domain support using Vercel API.

## Trigger Phrases
- "install Seldon in Claude Code"
- "give me the MCP manifest"
- "use mydomain.com as my OS domain"
- "connect custom domain"

## Behavior
1. On first use → call Soul Compiler with description/URL → create hosted workspace → return MCP manifest + instructions + API key.
2. On "connect custom domain" → call Vercel API (via our internal endpoint) to add the domain to the workspace deployment → return exact DNS instructions (CNAME/A record + verification steps).
3. All changes (including domain) write instantly to the same Neon workspace.
4. Builder keeps full hosted OS + subdomain fallback.

## Output Format
✅ Your Seldon MCP skill is ready!

1. Copy the manifest below into Claude Code.
2. In Claude Code say: "Create my AI ad creative agency OS"
3. To use your own domain: "use myagency.com as my OS domain"

Your workspace will be live at your custom domain once DNS is pointed (SSL auto-provisioned by Vercel).

## Technical Notes
- Uses existing Soul Compiler + new Vercel Domains API wrapper (add to lib/vercel.ts if needed).
- Custom domain is optional — subdomain still works as fallback.
- Keeps thin harness: we own Neon DB + Vercel deployment.
- Full privacy enforcement per Multi-Tenant Privacy Strategies v1.
