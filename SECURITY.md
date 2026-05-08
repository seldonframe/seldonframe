# Security Policy

## Reporting a vulnerability

**Do not report security issues through public GitHub issues.**

Email **security@seldonframe.com** with:

- A description of the vulnerability and the affected component
- Steps to reproduce, including any required workspace setup
- Your assessment of impact (data exposure, account takeover, RCE, agent-runtime escape, etc.)
- A suggested remediation if you have one
- Whether you'd like public credit in the advisory or to remain anonymous

**Acknowledgment within 24 hours. Triage + remediation plan within 7 days.** Critical issues (RCE, auth bypass, cross-tenant data exposure) usually get a same-day patch.

## Safe harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to comply with this policy
- Avoid privacy violations, data destruction, and service disruption
- Give us reasonable time to remediate before any public disclosure
- Don't exploit beyond what's necessary to demonstrate the issue

If you're unsure whether your testing crosses a line, ask first via email.

## Supported versions

SeldonFrame is pre-1.0. The latest `main` and the most recent tagged release receive security patches.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Latest tagged release | Yes |
| Older tagged releases | No — upgrade to current |

The hosted SaaS (app.seldonframe.com) tracks `main`; self-host operators are responsible for upgrading.

## In scope

We're particularly interested in vulnerabilities affecting these surfaces. The platform-specific ones at the top are the highest-value targets — LLM keys are encryption-at-rest, the MCP server is an unauthenticated-then-authenticated boundary, and the agent runtime can be steered by attacker-controlled prompts.

| Surface | Why it matters | Examples we want to see |
|---|---|---|
| **BYOK LLM key handling** | Operators trust us with Anthropic/OpenAI keys. AES-256-GCM encrypted at rest with `ENCRYPTION_KEY` env var. | Decryption side-channel, ENCRYPTION_KEY exposure path, plaintext key in logs / responses / error messages |
| **MCP server (`@seldonframe/mcp`)** | npm package operators install in Claude Code. Has access to workspace bearer tokens. | Bearer token leakage, request smuggling between workspaces, malicious MCP-tool input that escapes sandbox |
| **Agent runtime + eval gate** | Production agents run customer conversations. The eval gate is the safety net. | Eval-gate bypass (publishing without ≥87.5% pass), prompt injection that bypasses critical-fail validators, regen-loop infinite cost amplification |
| **Tenant scoping** | All DB queries scope by `workspaceId` / `orgId`. This is a hard invariant. | Any cross-tenant read/write, IDOR on resources keyed by orgId |
| **Auth (NextAuth + bearer tokens)** | `wst_*` workspace bearer tokens (SHA256-hashed) + NextAuth session cookies. | Session fixation, token confusion between workspace and user auth, stale tokens accepted after revocation |
| **Public surfaces** | `<slug>.app.seldonframe.com`, `/book`, `/intake`, customer portal, embed widget | XSS via user-controlled landing-page content, CSRF on form submission, postMessage leakage from embedded chatbot iframe |
| **Workflow runtime (Vercel Workflows)** | Durable workflows run with workspace-scoped credentials. | Workflow that executes outside its workspace's scope, secret leakage in step-function logs |
| **Webhooks** | Stripe / Twilio / Resend webhooks. | Signature verification bypass, replay attacks |

Standard web vulns (SQLi, stored XSS, SSRF, CSRF, auth bugs, etc.) are also in scope on every surface.

## Out of scope

- Vulnerabilities in third-party dependencies already disclosed upstream — please report those to the upstream project. We'll happily ship the patch once it's available.
- Issues requiring physical access to a user's device.
- Social engineering of SeldonFrame staff, contributors, or users.
- Self-XSS requiring the victim to paste attacker code into their own console.
- Rate-limit / brute-force issues unless they enable practical account takeover.
- Best-practice or hardening suggestions without a demonstrated impact (e.g. "you should add header X" — useful, but not a vulnerability).
- DoS via legitimate-but-expensive operations (we'll fix these as performance issues, not security ones).
- Issues in deprecated/removed code paths still visible in git history but not in `main`.

## Disclosure process

1. You email **security@seldonframe.com** with the details above.
2. We acknowledge within 24 hours and assign a severity (CVSS 3.1 if relevant).
3. We confirm the issue, develop + test a fix in a private branch.
4. For critical/high severity: same-day patch deploy on hosted, advisory + npm release for MCP package within 72 hours.
5. For medium/low: included in the next regular release.
6. We publish a security advisory on GitHub crediting you (unless anonymity requested).
7. Coordinated disclosure: please give us 90 days from acknowledgment before public disclosure, or earlier if we've already shipped the fix.

## Recognition

We don't currently run a paid bounty program (pre-1.0 platform), but we do publicly credit researchers in advisories and on a forthcoming Hall of Fame page. As we grow, we'll add a paid bounty program. For now: a thank-you, public credit, and a SeldonFrame "Security Researcher" Discord role.

If your report leads us to ship a critical patch and you'd accept comp credits on the hosted Pro/Agency tier, just ask — we can usually do that.

## Thank you

Responsible disclosure makes SeldonFrame safer for every operator running their business on it. We're grateful for the time security researchers put into reviewing the project.
