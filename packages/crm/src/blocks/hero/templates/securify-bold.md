---
id: securify-bold
theme: dark
needs_video: true
---

# securify-bold

**Vibe:** pure black background, looping Pexels MP4 at low contrast,
HUGE staggered typography. The headline breaks into 3 lines positioned
at corners-and-center for editorial drama. Stat values from
`riskReversalBadges` render in 3 corners with diagonal dividers.
Confidence + scale + no warmth.

**When to use:** dev tools, data security, AI infrastructure, hard-tech
SaaS, anything where the brand wants to project "we are serious" louder
than cinematic motion could. The aggressive-modern alternative to
nexora-light.

**Copy pattern:** SHORT, lowercase-feeling headlines. The renderer
lowercases the headline automatically, so write in title case and it
will appear as bold lowercase. 3-6 words max. The headline gets split
into 3 roughly-even chunks for the staggered layout — write copy that
breaks naturally into 3 beats.

**Headline examples (good):**
- "Protect Your Data" → renders as "protect / your / data"
- "Ship Faster Stay Calm" → renders as "ship faster / stay / calm"
- "Encrypt Everywhere Always" → renders as "encrypt / everywhere / always"

**riskReversalBadges should be metric strings:** "+65k startups",
"+1.5B requests", "200% growth", "99.99% uptime". The renderer splits
on the first space and renders value-then-label.

**Consumes:** headline, subheadline, ctaText, ctaLink, secondaryCta,
riskReversalBadges (used as stat blocks), heroVideo,
heroVideoAttribution.
