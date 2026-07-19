# SeldonFrame launch video (Remotion)

Code-generated launch video — no video editor. React components render to MP4 via
[Remotion](https://remotion.dev). Standalone subproject: own `package.json`, **not** part of
the pnpm workspace, never touches CI.

## Quick start

```bash
cd launch-video
npm install
npm run studio            # interactive preview
npm run render            # 16:9 master  → out/seldonframe-launch-16x9.mp4
npm run render:vertical   # 9:16 vertical → out/seldonframe-launch-9x16.mp4
```

## What's in it

7 scenes, 61s, on a 100 BPM beat grid (see `BEAT-MAP.md` for CapCut sound design):

1. **Hook** — the 1-person-agency article's chore pile vs "type one sentence"
2. **Workspace** — real `workspace-head.png` capture inside a browser frame
3. **Surfaces** — one agent answering phone/SMS/web chat/email/DM
4. **Six parts** — the 6 primitives (Surface·Skill·Tools·Knowledge·Guardrails·Voice)
5. **Front office** — 3 real generated client sites (`shots/`), MONTHLY RETAINER badges
6. **No meters** — climbing meter vs $29/mo flat (matches live pricing section)
7. **CTA** — real-UI montage (CRM/automations/booking) → flywheel → end card

## House rules baked in

- **Brand:** forest `#1F2B24` / paper / sand, Space Grotesk + IBM Plex Mono, squared corners,
  stamp-in motion (never fades). Tokens in `src/theme.ts`.
- **Real screenshots are cropped via `ShotCrop`** (`src/components/core.tsx`) to remove the
  account sidebar/header (personal email + username) and double browser chrome. If you swap
  in fresh screenshots, re-check crops at a still before rendering.
- **Timing is all beats:** `b(n)` = n beats = n×18 frames. Retime scenes in `src/theme.ts`.
- **Claims:** approved positioning only — see the discipline note in `BEAT-MAP.md`.

## License note

Remotion is free for individuals and companies ≤3 people (company license above that).
SeldonFrame currently qualifies; revisit if the team grows.
