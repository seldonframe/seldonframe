# SeldonFrame launch video — beat map + CapCut notes

**Files:** `out/seldonframe-launch-16x9.mp4` (1920×1080) · `out/seldonframe-launch-9x16.mp4` (1080×1920)
**Length:** 102 beats · 61.2s · 30fps · silent by design
**Music:** drop any **100 BPM** track on the timeline with its first kick at 0:00 — every
stamp in the video lands exactly on this grid (1 beat = 0.6s = 18 frames). If your track is a
different BPM, CapCut → clip → Speed → set rate to `yourBPM / 100`.

The mono "build log" line (bottom-left) ticks a ✓ on the same beats — use it as the visual
metronome when nudging SFX.

## Global timeline (times from video start)

| Scene | Starts | Ends | What happens | Sound design |
|---|---|---|---|---|
| 1 · Hook | 0:00.0 | 0:09.6 | Article chore-pile stamps in (one per ¾ beat, 0.5s–4s) → terminal at 3.9s → typing 4.2–7.2s → **payoff "Or type one sentence." at 7.5s** | Hi-hat per chore line; keyboard SFX under typing; **beat-drop + bass hit at 7.5s** |
| 2 · Workspace | 0:09.6 | 0:18.6 | Browser stamps 10.2s → URL types 10.5–11.7s → **real "Roofs by Shiloh is live" screen reveals 12.0s** (slow push-in) → ✓ crm/calendar/intake/chatbot/site tick 12.6–14.4s → caption 15.6s | Typing SFX callback; one kick per ✓ tick (5 ticks, ¾-beat apart) |
| 3 · Surfaces | 0:18.6 | 0:26.4 | Core 19.1s → 5 surface cards 19.3–20.5s → pulses start travelling 20.4s and loop | Rimshot per card; let pulses breathe (best background footage — extend here if VO runs long) |
| 4 · Six parts | 0:26.4 | 0:33.6 | Core 27s → 6 primitive tiles 27.3–28.8s (½-beat apart) → wires draw → payoff line 31.2s | Hi-hat pattern for the 6 stamps; nothing else |
| 5 · Front office | 0:33.6 | 0:42.6 | "Your Agency" 34.5s → **3 REAL client sites** stamp 35.4/36.0/36.6s → MONTHLY RETAINER badges punch 37.8/38.1/38.4s → caption 39.6s | Kick per client site; **cash-register or deep thud ×3 on the badges** |
| 6 · No meters | 0:42.6 | 0:51.6 | Meter panel 43.2s → fees stack 43.5–44.7s → meter ticks $89→$727 (44.1–45.9s, shakes) → **$29/mo flat stamps 46.2s** → flat line draws → perks tick 47.1–48.6s | Accelerating tick/geiger with the meter; **biggest hit of the video at 46.2s**; whoosh on the flat line |
| 7 · CTA | 0:51.6 | 1:01.2 | Real-UI montage (CRM → automations → booking, 0.9s each to 54.3s) → flywheel 54.4–57.3s → **end card 57.3s**: "Type a sentence. Ship a business." + seldonframe.com | Fast cuts with the montage; music **cuts to silence on the end card** — leave only the blinking caret |

## CapCut assembly

1. New project → import both MP4s. The 16:9 is the master; the 9:16 is a native re-layout
   (not a crop) for Shorts/TikTok.
2. Add your 100 BPM track, first beat at 0:00. Nudge ±5 frames if your track's intro swings.
3. Auto-captions off — the video already carries its copy. Add VO if you want (script above,
   one line per scene reads well in ~60s).
4. Optional polish: film-grain overlay at 10–15% across the whole timeline; 2-frame white
   flash on the three bolded beat-drops (7.5s / 46.2s / 57.3s).
5. Trim: to hit ~45s, drop scene 4 (Six parts) — scene order was chosen so it lifts out clean.

## Claims discipline (never-lies)

Everything on screen is approved positioning: real hosted workspace on a real subdomain
(actual product screenshot), no claim step / no key / no guest mode, $29/mo flat, no meters,
unlimited workspaces, open source — yours to keep, first workspace free, whitelabel front
office (real generated client sites). The article's "$40k MRR" is NOT in the video — if you
reference it in the post copy, attribute it to the article's author, never as our claim.

## Re-rendering after edits

```bash
cd launch-video
npm run studio          # live preview at localhost:3000
npm run render          # 16:9 → out/seldonframe-launch-16x9.mp4
npm run render:vertical # 9:16 → out/seldonframe-launch-9x16.mp4
npx remotion still S2Workspace out/check.jpeg --frame=230   # spot-check any frame
```

Timing lives in `src/theme.ts` (`SCENES`, beats per scene) — every cue in every scene is
expressed as `b(beats)`, so retiming a scene is one number.
