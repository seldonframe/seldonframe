# YouTube sources for information-gain — the niche channel list

**This is where you "prime the pump."** The `information-gain` skill
(`.claude/skills/information-gain`) reads THIS file to know which YouTube
channels/creators to mine for original founder stories, real numbers, and
failures — the non-commodity material that makes a guide rank and get cited by
AI answer engines.

Edit freely: add a channel under the cluster it feeds, remove ones that stop
yielding. More specific + higher signal = better articles. A channel earns its
place by having **spoken specifics that exist nowhere else in writing** (real
MRR, real ad spend, a real failure), not by being big.

---

## How the loop uses this

1. When a content loop (x-post-engine / content-loop) sources a topic, the
   `information-gain` skill picks the channels under the matching cluster below.
2. It tries the automated transcript fetch first:
   `node scripts/youtube-transcript.mjs "<video-url>" --json`.
3. **If auto-fetch is blocked** (YouTube throttles the free transcript services
   often), take the manual route — paste the video URL into
   <https://notegpt.io/youtube-transcript-generator>, copy the transcript, and
   save it as a `.txt`/`.md` file in **`docs/strategy/youtube-transcripts/`**
   named `<channel>-<slug>.md` with the source URL on the first line. The skill
   checks that drop folder BEFORE fetching, so anything you save there is used
   directly (this is the reliable path when the API is blocked).
4. Every mined fact is cited back to its video in the published article — always.

So there are two ways to feed the loop: **add a channel here** (it'll go find
videos), or **drop a transcript** in `docs/strategy/youtube-transcripts/` (it'll
use it as-is). Do the second when the first is being throttled.

---

## Channels by cluster

> Seed list — VERIFY + curate these to your taste; they're starting suggestions,
> not vetted picks. Prefer channels with recurring founder interviews / real
> numbers over generic "tips" channels.

### speed-to-lead · booking · no-shows · ai-receptionist (service-business ops)
- Home-service / contractor operator channels (HVAC, plumbing, med-spa, dental
  practice-growth) — densest source of real "a missed call cost me $X" stories.
- Add specific channels here → `- <Channel name> — <youtube url> — <why>`

### ai-agents · sell-agents · ai-visibility (builders, agencies, GEO)
- Greg Isenberg — https://www.youtube.com/@GregIsenberg — startup/agency ideas, real numbers
- Starter Story — https://www.youtube.com/@StarterStory — founder revenue interviews
- Add GoHighLevel / AI-automation-agency channels here (real client + MRR figures)

### gohighlevel · reviews · service-faq
- Agency-owner channels that show real client dashboards + retainer numbers.
- Add here →

---

## Rules (inherited from the information-gain skill — never-lies)
- Only mine channels where the speaker states **specifics you can quote**.
- Never write a number the transcript doesn't say. Cite + embed every source video.
- A channel that only yields generic advice ("focus on the customer") yields no
  brief — that's fine, drop it from the list.
