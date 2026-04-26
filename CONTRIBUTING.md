# Contributing to SeldonFrame

Thanks for your interest in making SeldonFrame better. This guide covers how to set up the repo, the workflow we use, and what we look for in PRs.

## Welcome

SeldonFrame is open source under MIT. Issues, bug reports, feature ideas, docs improvements, and code contributions are all welcome. If you're not sure where to start, drop into [Discord](https://discord.gg/sbVUu976NW) and ask.

## Ways to contribute

- **Report bugs** — file a [bug report issue](https://github.com/seldonframe/seldonframe/issues/new?template=bug_report.md).
- **Request features** — open a [feature request issue](https://github.com/seldonframe/seldonframe/issues/new?template=feature_request.md) or discuss in Discord first.
- **Improve docs** — fixes, clarifications, and new examples are all valuable.
- **Build a block** — extend the marketplace with a new BLOCK.md.
- **Ship code** — pick an issue labeled `good first issue` or `help wanted`.

## Development setup

Prerequisites:

- Node.js 20 or newer
- pnpm 9 or newer
- A Postgres database (Neon, Supabase, or local)

```bash
git clone https://github.com/seldonframe/seldonframe.git
cd seldonframe
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm db:migrate
pnpm dev:crm
```

Visit `http://localhost:3000`.

## Workflow

1. Fork the repo and create a focused branch from `main`.
2. Keep each PR scoped to one concern.
3. Follow TDD where it applies — write a failing test before the production code.
4. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` before pushing.
5. Update docs and `.env.example` if your change adds config.
6. Open a PR using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## Code style

- TypeScript strict mode. No `any` without a comment justifying it.
- Prettier + ESLint enforced via `pnpm lint`.
- Prefer composition over inheritance.
- Tenant scoping (`workspaceId` / `orgId`) is a hard invariant — never bypass it.
- Commit messages follow conventional commits: `type(scope): subject`.

## Pull request guidelines

- Small and reviewable beats large and mixed.
- Include screenshots or GIFs for UI changes.
- Note any schema, env, or breaking-API changes in the PR body.
- Link the issue you're closing (`Closes #123`).
- Make sure CI is green before requesting review.

## Questions

- General questions → [Discord](https://discord.gg/sbVUu976NW)
- Bug or feature → [GitHub Issues](https://github.com/seldonframe/seldonframe/issues)
- Security → see [SECURITY.md](SECURITY.md)
