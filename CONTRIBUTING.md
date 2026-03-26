# Contributing to Seldon Frame

Thanks for helping improve Seldon Frame.

## Development Workflow

1. Fork the repository.
2. Create a focused feature branch from `main`.
3. Keep changes scoped to a single concern.
4. Run quality checks locally:
   - `pnpm lint`
   - `pnpm build`
5. Open a pull request with:
   - clear summary
   - screenshots or GIFs for UI changes
   - notes about schema/env changes

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm dev
```

## Pull Request Guidelines

- Prefer small, reviewable PRs over large mixed changes.
- Preserve tenant scoping and auth boundaries.
- Avoid introducing breaking API behavior without migration notes.
- If you add environment variables, update `.env.example` and `README.md`.

## Reporting Issues

Please include:

- expected behavior
- actual behavior
- reproduction steps
- logs/screenshots if relevant

## Code of Conduct

Be respectful and constructive. Harassment and abusive behavior are not tolerated.
