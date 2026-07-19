# v2 launch video — beat map (parchment · VO-driven · A-roll bookends)

**Files:** `out/seldonframe-launch-v2-16x9.mp4` · `out/seldonframe-launch-v2-9x16.mp4`
**Length:** 126 beats · 75.6s · 30fps · silent (VO + music added after you record — see SHOT-LIST.md)
**Grid:** 100 BPM (1 beat = 0.6s). This grid is PROVISIONAL — once you send the VO I
re-time every scene to word-level Whisper timestamps, so don't hand-sync anything yet.

| Scene | Starts | What happens | VO line (from SHOT-LIST.md) |
|---|---|---|---|
| 0 · A-roll hook | 0:00.0 | **Your clip A** (dashed placeholder now) → 0:05.4 category card: "The AI front office platform agencies actually own." | line 1 |
| 1 · The demo | 0:07.8 | Real Metro Medspa site, visitor cursor → clicks the real chat bubble → widget opens (rebuilt from the live widget) → asks for Thursday HydraFacial → picks 2:00 PM → ✓ Booked card → **cut to Google Calendar, event pops into Thu 2 PM + "synced from metro-medspa" toast** | line 2 |
| 2 · One sentence | 0:24.0 | "You typed one sentence." → forest terminal types "a front office for a medspa in St. Louis" → the SAME site drops in + ✓ site/crm/calendar/intake/agent | line 3 |
| 3 · Plain English | 0:34.2 | "> add a $50 deposit to new bookings" types → booking card updates itself: deposit chip pops, toggle flips | line 4 |
| 4 · Integrations | 0:44.4 | Real-logo toggle wall (Google Calendar · Gmail · Outlook · Twilio · Stripe · Slack · Instagram · QuickBooks) flips on → "your API keys · wholesale costs · zero markup" → "no usage meters. ever." | line 5 |
| 5 · Own it | 0:54.6 | "Own everything. Leave anytime." → forest slab: `$ docker compose up` · ghcr.io/seldonframe/seldonframe · open source → "everything comes with you" | line 6 |
| 6 · Pricing | 1:02.4 | "elsewhere: ~~$497/mo~~ just to unlock reselling" → **$99/mo flat** → "White-label every client. Start free." + two more real client sites (SKINNEY, Rejuvenate) | line 7 |
| 7 · A-roll close | 1:08.4 | **Your clip B** → 1:12.0 forest end card: "Type a sentence. Ship a business." · seldonframe.com · "start free" | line 8 |

## GHL pain → scene map (vocabulary is theirs, name is never said)

- weeks-of-setup / learning curve → scenes 2 + 3 ("live in minutes", "no certification course, no admin maze")
- usage meters / stacked fees → scene 4 ("no usage meters. ever.") — never say "hidden fees"
- $497 SaaS-Mode gate → scene 6 (exact phrasing "just to unlock reselling")
- lock-in / no-export → scene 5 ("own everything, leave anytime, everything comes with you")
- reliability + AI-quality → deliberately absent (prohibited-claims guard)

## Launch-day notes (Helena playbook)

- Post copy hook (text above the video — doesn't have to match the spoken line):
  "Local businesses pay agencies hundreds a month for what's in this video. It gets built
  in one sentence. Here's how it works:" — then the category claim lands on-screen at 0:05.
- Spoken hook = the ICP callout ("If you sell websites, AI agents, or automations to local
  businesses…") — self-selects GHL resellers / web shops / AI-agent builders in 2 seconds.
- Consider Monday 7am PT over the default Tuesday window.
- First 60 min: friends/investors QT choreography before any influencer layer.
- The $497-vs-$99 comparison is the built-in debate bait for the comment thread.

## Audio + effects spec (CapCut pass)

**Music:** one minimal warm instrumental, 100 BPM (matches the animation grid), no risers/hooks.
Free: Pixabay/Uppbeat/YT Audio Library. Gen prompt: "instrumental only, 100 BPM, warm Rhodes
keys, soft muted bass, brushed percussion, consistent low energy, no risers, no melodic hook,
85s, clean downbeat ending." Energy map: SILENT under the hook (dry voice = confidence) →
starts on the category card downbeat → steady + auto-ducked −6dB under VO → fullest at the
$99 reveal → **hard cut to silence on the end card** (caret only).

**SFX (14 total — delete one before adding one):** click+pop on chat bubble open · 2 message
pops max · ding on ✓ Booked · whoosh-thud on the calendar event under "Confirmed." · keyboard
under both typing moments (signature sound) · 5 tiny ticks on the receipts · switch click on
"Done." and on the FIRST logo toggle only · deep soft thud on $99 · one warm hit into the
end-card silence. No SFX on cursor movement (silence sells "real visitor").

**Transitions:** hard cuts only, on VO sentence boundaries. Scenes self-animate in code —
any CapCut transition on top = double-animation = slop. The demo→GCal cut is the one
designed transition.

**Effects:** film grain ~8–10% across the whole timeline (unifies iPhone footage with
renders — highest-value effect). A-roll clips: warm color-match + slow 100→105% punch-in.
Rendered scenes: nothing. Captions only over the two A-roll clips (mono, cream).

**Mix:** VO lead · music −6dB under voice · SFX under VO peaks · export −14 LUFS.

## Remaining pipeline (when you send footage + VO)

1. Whisper word-timestamps → re-time all `b()` cues in `src/theme.ts` V2 map + per-scene beats.
2. `<OffthreadVideo>` your clips into V2S0Aroll / V2S7Close (replace the dashed slates).
3. Music: any minimal 100 BPM instrumental under the VO at −18dB, cut to silence on the end card.
4. Final loudness pass in CapCut/Resolve to −14 LUFS.
