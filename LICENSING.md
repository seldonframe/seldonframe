# Licensing

SeldonFrame is dual-licensed.

## TL;DR

| You're doing | Use this |
|---|---|
| Self-hosting for your own business or your clients (no modifications, or modifications you're happy to share) | **AGPL-3.0** (free) |
| Embedding SeldonFrame in a closed-source product | **Commercial license** (talk to us) |
| Running a hosted SaaS based on a SeldonFrame fork without sharing modifications | **Commercial license** (talk to us) — or use our hosted Agency tier ($99/mo), which is the de facto commercial license |
| Just kicking the tires, evaluating, contributing | **AGPL-3.0** (free) |

## What AGPL-3.0 means in practice

AGPL-3.0 is a strong copyleft license with a "network use" trigger. The full text is in [LICENSE](LICENSE). The short version:

- **You can use SeldonFrame for anything.** Personal use, commercial use, internal tools, client work — all fine.
- **You can modify it.** Fork the repo, change the code, run your version.
- **If you distribute or run a modified version as a network service, you must share your modifications** under AGPL-3.0. Anyone using your service gets the right to download the source.
- **You cannot make modified SeldonFrame closed-source.** That's the network-use trigger AGPL adds beyond regular GPL.

The 99% of operators who use SeldonFrame as-is — configure via skill packs, set brand colors, populate content — are not "modifying" it. They're using it. AGPL doesn't affect them.

The cases where AGPL matters:

1. **Forks**: if you fork SeldonFrame and change platform code, then deploy that fork as a network service, your modifications must be open under AGPL.
2. **White-label SaaS**: if you fork SF and resell it as your own SaaS, your fork's source must be public.

## When you need a commercial license

Reach out if any of these apply:

1. **You want to embed SeldonFrame** (or significant pieces of it) in a closed-source product without the AGPL share-modifications obligation.
2. **You want to run a hosted SaaS** based on a SeldonFrame fork, with proprietary modifications you don't want to share.
3. **You're an enterprise** whose legal team is uncomfortable with AGPL contributions or use, and you want commercial terms instead.
4. **You're an investor or acquirer** doing due diligence on a SeldonFrame-derived product.

Two paths for commercial use:

### Path A — Hosted Agency tier ($99/mo)

The hosted Agency tier of [seldonframe.com](https://seldonframe.com/#pricing) is the simplest commercial path. It includes:

- Multi-tenant agency mode (host clients on SF infrastructure)
- Full white-label (your brand, your domain, no SF watermarks)
- Per-workspace custom domains
- Priority support + SLA
- Commercial use without the AGPL share-modifications requirement on modifications you make to SF code through the supported customization paths (skill packs, theme, custom blocks via our APIs)

Note: Even on Agency tier, modifications to SeldonFrame's *core platform code* would still be subject to AGPL if redistributed. The Agency tier covers commercial *use* of the unmodified platform; deeper code modifications require Path B.

### Path B — Custom commercial license

For embedding, deep modifications, or use cases the hosted tier doesn't cover, we offer custom commercial licenses. Pricing depends on use case and scale. Email **hello@seldonframe.com** with:

- Your company name and a short description of what you're building
- Whether you need source modification rights, embedding rights, or both
- Estimated user count or revenue scale
- Your timeline

We typically respond within 2 business days. Most commercial licenses sign in under a week.

## Why we chose AGPL

Three reasons:

1. **It protects the open community.** A permissive license (MIT, Apache) lets anyone fork SeldonFrame, white-label it, and resell it as a closed-source SaaS without contributing back. That's bad for the operators we serve, bad for the contributors who'd otherwise share improvements, and bad for the project's long-term health. AGPL closes that loop.
2. **It makes commercial value capturable.** Without a real moat, we can't fund the platform. With AGPL + Path A/B above, agencies and enterprises that want commercial terms have a clear path. Postiz makes ~$17K/mo on this exact model. Mattermost is a $250M+ company on this model. We don't have to invent the playbook.
3. **It signals seriousness.** AGPL-3.0 is the license MongoDB used (until they moved to SSPL), the license Mattermost uses, the license Plausible uses. It says "we're building a real open platform, not a marketing-loss-leader to sell hosted." Open-source-first companies pick it deliberately.

## What's covered by which license

| Component | License |
|---|---|
| Platform code (`packages/crm`, `packages/core`, etc.) | AGPL-3.0 |
| MCP server (`@seldonframe/mcp` npm package, `skills/mcp-server`) | AGPL-3.0 |
| Docs, marketing site, blog content | AGPL-3.0 |
| Skill packs (`packages/crm/src/lib/agents/skills/`) | AGPL-3.0 |
| Eval suites, fixtures, seed data | AGPL-3.0 |
| Block library, motion primitives | AGPL-3.0 |
| Logos, brand assets (`packages/crm/public/brand/`) | All rights reserved — see brand guidelines for fair use |

The brand assets are the one exception: SeldonFrame logos and wordmarks are not under AGPL. You can use them to refer to SeldonFrame in articles, integrations, or documentation, but you can't use them as your own product's logo or in a way that implies endorsement. If in doubt, email us.

## Existing contributors

Pre-v1.34.3 contributions were made under the MIT license. As part of the relicense, we treat existing contributions as having been re-licensed under AGPL-3.0 for forward compatibility, per the contributor's act of pushing to the repository under a project that has the right to relicense. If you contributed before v1.34.3 and have concerns about your contributions being included under AGPL, please open an issue and we'll work with you to either remove your contribution or document a separate license arrangement.

Going forward, all contributions are accepted under AGPL-3.0 per [CONTRIBUTING.md](CONTRIBUTING.md).

## Questions

- Licensing or commercial: **hello@seldonframe.com**
- Discord: [discord.gg/sbVUu976NW](https://discord.gg/sbVUu976NW)
