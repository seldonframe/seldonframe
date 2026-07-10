# X Article draft — 2026-07-10 (2 of 3) · REWRITTEN v2 (paste-clean, verbal)
Format: value post at essay length · Keyword: Claude Code from your phone
[FILL] markers = your real receipts — fill before posting, never estimate.

Title alternates (pick per surface):
  A (search-first, current): Claude Code from your phone: ship real work with Termius + Tailscale + Hetzner, no laptop
  B (feed, contrarian): I stopped carrying a laptop. The agent works; my phone watches.
  C (levelsio nod): The levelsio way, one command: Claude Code on a Hetzner box you reach from anywhere

===== ARTICLE BODY (paste everything between these lines) =====

Claude Code from your phone: ship real work with Termius + Tailscale + Hetzner, no laptop

The agent lives on a [FILL: €X/mo] server with zero open ports. My phone is just the window I check on it through.

I watched levelsio vibecode an entire DNS server in 15 minutes and I thought the impressive part was the speed. It wasn't. The impressive part was where. On a remote box he could reach from anywhere.

Then someone in my bookmarks wrapped that whole idea into one command. A Hetzner box running your AI coding agent on your own subscription. Tailscale only. Nothing inbound. And it clicked for me: the era of "I'll do it when I'm back at my desk" is just over.

So I set it up. Here's the whole stack, why each piece is there, and what shipping from a phone actually feels like.

The stack, and why each piece

Hetzner is the box. A small cloud server, [FILL: your instance type and €/mo], is genuinely enough, because the heavy lifting happens on Anthropic's side. Claude Code on the server is a coordinator, not a compiler. You're paying for a persistent place where the agent lives. Not for compute.

Tailscale is the door. This is the piece people skip and then regret. It puts the server and my phone on a private mesh network, so the Hetzner firewall stays completely empty. Nothing inbound. No exposed SSH port. No bot swarm hammering port 22 an hour after boot. The server simply doesn't exist except for devices I own. Setup was one install on each end and signing in twice. [FILL: minutes it took you]

Termius is the window. An SSH client on the phone that doesn't fight you. Persistent sessions, real shortcuts, snippets for the commands I type daily.

tmux is the memory. The one non-negotiable. Claude Code runs inside a tmux session on the server, so when my phone sleeps, or the elevator kills my signal, or I just put it back in my pocket, the agent keeps working. I reattach an hour later and read what happened while I was gone. tmux attach is the whole ritual.

And Claude Code is the worker. Runs on the server under my existing subscription. Same skills, same tools, same repo access as my desk setup. Because it IS my setup. I just moved it somewhere that never sleeps.

What it actually feels like

The mental shift is bigger than the technical one. Coding from a phone sounds miserable because you're imagining typing code on glass. You're not. You're typing sentences.

A real moment from this week: I'm away from my desk, I open Termius, attach to tmux, and type "run the bookmark pull, distill the new entries, draft this week's posts." Then I put the phone away. The agent doesn't need me hovering. It needs me for the two or three judgment calls it can't make alone, and honestly, those fit on a phone screen better than a diff ever will.

The rhythm becomes: fire the instruction, pocket, check in ten minutes, make the call, pocket again. It's closer to managing than typing. Which is what working with agents already was. The phone just makes it honest.

[FILL: one real moment — where you were the first time you shipped something real from the phone, and what it was]

The security shape, because someone will ask

The box has no open ports. Not "SSH on a weird port." None. Tailscale's mesh is the only way in, and it authenticates devices, not passwords. If my phone gets stolen, I revoke the device from the admin panel and the thief is holding a brick pointed at nothing.

The agent has exactly the credentials the repo needs and nothing else. It can't reach my bank, my email, or my cloud console, because none of that lives on the box. Worst case, the blast radius is one git repo that's backed up anyway.

Could I harden it further? Sure. But empty firewall plus device mesh plus minimal credentials already beats the laptop I used to carry through airports.

What I don't know yet, honestly

The phone review problem is real. Reading a 40-file diff on a 6-inch screen doesn't work, and I'm not going to pretend it does. From the phone I approve direction. Anything that needs line-by-line review waits for a real screen. The alternative is rubber-stamping, and an agent with a rubber stamp is how you ship a disaster.

Costs are small but not zero. The box runs around the clock whether I use it or not. [FILL: actual monthly all-in]. Against what it replaced, a laptop I felt chained to, I'll take it. But I've only run this for [FILL: days/weeks], so ask me about the bill in three months.

Signal dependence stays. tmux means a dropped connection doesn't kill work, but starting anything new from a dead zone is still impossible. This setup removes the desk, not the network.

And I haven't stress-tested recovery. If Hetzner eats the box tomorrow, my repos are on remotes and the rebuild is an hour. In theory. I haven't rehearsed it, and until I run that drill I'm not claiming the resilience story.

What's next

This setup just became part of a bigger machine. My content loop, the bookmark vault, the weekly drafts, runs on schedules now, and the phone means I review and steer it from anywhere. The desk is turning into the place I do deep review. Not the place work happens.

Want this setup? Steal the prompt.

Give this to your coding agent, word for word. Copy everything between the lines.

----------------------------------------

Set up remote agent coding I can drive from my phone. 1) Provision the smallest Hetzner cloud server, Ubuntu. 2) Install Tailscale on it and walk me through installing it on my phone, then set the Hetzner firewall to zero inbound rules — Tailscale's mesh is the only door. Confirm SSH only works over the tailnet. 3) Install tmux and my AI coding CLI on the box under my existing subscription, and clone my repo with a deploy key scoped to that repo only, nothing else. 4) Create a tmux session that survives disconnects and show me the exact one-line command to reattach from Termius on my phone. 5) Walk me through revoking the phone from the Tailscale admin panel, so I know the stolen-phone drill before I need it. Explain each step as you go — I want to understand my own infrastructure.

----------------------------------------

That's the whole thing. The hardest part is realizing there is no hard part left.

If you build with agents and still can't leave your desk, the tools have outrun your setup.

===== END ARTICLE BODY =====

## FORMATTING MAP (X Article editor)

Style as HEADINGS (these exact plain lines in the body):
- The stack, and why each piece
- What it actually feels like
- The security shape, because someone will ask
- What I don't know yet, honestly
- What's next

Bold: "the era of 'I'll do it when I'm back at my desk' is just over" · "Nothing
inbound." · "You're typing sentences." · "It's closer to managing than typing." ·
"the tools have outrun your setup"

Italic: "where" (para 2) · "direction" (phone review problem) · "tmux attach is
the whole ritual."

Cover image (5:2, CAPTURE): your phone in hand or on a table, Termius open with a
live Claude Code tmux session visible, wide 5:2 crop. The realness IS the cover —
do not generate this one.

CONCEPT DIAGRAM (5:2, GENERATED, RENDERED): diagram-phone-stack.png — phone →
Tailscale mesh → Hetzner box (tmux · Claude Code · repo), "0 open ports" and the
stolen-phone line. Place after "The stack, and why each piece" section. The
screenshot-and-save asset.

Bold the line "Want this setup? Steal the prompt."

Inline images (all 5:2 crops):
1. CAPTURE — Termius session, Claude Code mid-task (blur any secrets in scrollback).
   After "What it actually feels like" heading.
2. CAPTURE — Tailscale admin panel, the two devices visible. After the security
   section's first paragraph.
3. CAPTURE — Hetzner firewall page, zero inbound rules. Next to "no open ports".

## SUPPORTING TWEETS (unchanged)

T1 · number · day 2 AM:
```
My whole dev machine is a [FILL: €X/mo] server and the phone already in my pocket.

No open ports. No laptop. The agent works; I make the calls from wherever I am.

Full setup in the article ↓
```

T2 · insight · day 4 PM:
```
Coding from your phone sounds miserable because you imagine typing code on glass.

You're not. 𝗬𝗼𝘂'𝗿𝗲 𝘁𝘆𝗽𝗶𝗻𝗴 𝘀𝗲𝗻𝘁𝗲𝗻𝗰𝗲𝘀.

The agent needs judgment calls, not keystrokes. Those fit on a phone.
```

T3 · contrarian · day 6 midday:
```
Unpopular: the desk is becoming the place you REVIEW work, not where work happens.

Empty firewall. Tailscale mesh. tmux that never sleeps. Claude Code on a $5 box.

If you build with agents and can't leave your desk, your setup is behind your tools.
```
