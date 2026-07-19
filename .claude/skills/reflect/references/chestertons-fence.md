---
name: chestertons-fence
source: https://fs.blog/chestertons-fence/
fetched: true
fetched_on: 2026-07-15
---
# Chesterton's Fence

## Core idea
G.K. Chesterton's parable: a reformer finds a fence across a road and wants it gone. The wiser reply: go away and think — you may clear it only once you "know why it was put up in the first place." The principle is not a defense of the status quo; it is a rule about *sequence*. You earn the right to change or remove something established only after you can explain the purpose it was serving. Fences rarely build themselves — someone paid a cost to erect this one, which is evidence (not proof) that it did something. Acting on a system you don't understand means acting on consequences you can't see.

This is second-order thinking applied to existing systems: the first-order view says "this thing is in my way, delete it"; the second-order view asks what the thing is quietly holding back, and what ripples removal sends through everything connected to it — effects that can surface years later.

## When it bites
- You inherit code, a process, a rule, or a config line that looks pointless and are tempted to delete it on sight.
- A structure seems inefficient (hierarchy, approval step, redundant check) and "flat/simple" feels obviously better. The article's example: hierarchy-free companies don't remove power, they make it informal — charisma replaces qualification.
- Removing a "bad" habit or norm without asking what need it was meeting — the need finds a replacement, often worse.
- Something looks wasteful by design (the peacock's tail): the inefficiency IS the function (a costly signal). Optimizing it away destroys what it did.
- Sweeping reform energy: the urge to tear down many old things at once, before understanding any of them individually.

## How to run it
1. Name the fence precisely: what exactly would you remove or change?
2. Ask: who put it up, when, and what problem were they solving? If you can't answer, that's your task before any removal — dig (git blame, ask the author, read the original decision doc).
3. Ask whether that original problem still exists. This is the crucial branch.
4. If the reason is dead (the condition it guarded against is gone), remove the fence confidently — the principle explicitly permits this. It does NOT say every fence must stand forever; it says removal requires understanding first.
5. If the reason is alive, either keep the fence or design a replacement that covers the same failure mode before demolition.
6. Before executing, run the ripple check: what second-order effects does removal trigger in adjacent systems?

## Failure modes
- **Fence-worship**: misusing the principle as blanket conservatism — "we can't change anything." The article is explicit that the point is understanding before change, not preventing change. Once you know the reason and it no longer holds, removal is the correct move.
- **Fake reasons**: accepting "we've always done it this way" as the explanation. That's not the reason the fence was built; that's the absence of one. Keep digging.
- **Infinite research**: some fences genuinely have no discoverable reason (lost history, accident, cargo cult). At some point you probe carefully — remove behind a flag, in a reversible way — rather than stall forever.
- **Assuming intelligence where there was none**: some fences were erected by mistake or for reasons that were bad even at the time. The principle asks you to *find* the reason, not to presume it was good.

## Applies here when…
- Retiring anything marked SHIPPED-but-dark (a feature flag, an old pricing line, a legacy route like `(marketing)/`): find out why it was gated or kept before deleting — CLAUDE.md's superseded-pricing history exists precisely because old fences had reasons.
- "Reuse, don't rebuild" decisions: before replacing an existing pipeline (e.g. `createFullWorkspace`, `bookingMode`), understand why it was shaped that way — its odd corners usually encode a client-facing failure that already happened once.
- Simplifying the funnel or onboarding ("why do we ask for X here?"): a seemingly redundant step may be the guardrail that keeps never-lies true; know its purpose before cutting friction.
- Re-litigating settled direction (§1b constraints, no-Zapier, BYO-OAuth): these fences have documented reasons — check whether the reason changed before proposing removal.
- Third-party conventions that look dumb (Stripe metadata patterns, Vercel config, migration hand-numbering): assume a reason exists, find it, then decide.
