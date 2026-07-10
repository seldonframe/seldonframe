# X Article draft — 2026-07-10 (2 of 3)
Format: value post at essay length · Keyword: Claude Code from your phone
Target: X Article (Premium+) · ~1,550 words
[FILL] markers = your real receipts — fill before posting, never estimate.

---

# Claude Code from your phone: the Termius + Tailscale + Hetzner setup

### My laptop stopped being the bottleneck. The agent works on a $5 server, and my phone is just the window I check on it through.

I saw levelsio vibecode an LLM-over-DNS server in 15 minutes and thought the interesting part was the speed. It wasn't. The interesting part was *where* — on a remote box he could reach from anywhere.

Then someone in my bookmarks wrapped that whole idea into one command — a Hetzner box running your AI CLI on your own subscription, Tailscale-only, nothing inbound — and I realized the era of "I'll do it when I'm back at my desk" is just over.

So I set it up. Here's the whole stack, why each piece, and what it actually feels like to ship from a phone.

## The stack, and why each piece

**Hetzner: the box.** A small cloud server — [FILL: your instance type and €/mo] — is enough, because the heavy lifting happens on Anthropic's side. Claude Code on the server is a coordinator, not a compiler. You're paying for a persistent place where the agent lives, not for compute.

**Tailscale: the door.** This is the piece people skip and regret. Tailscale puts the server and your phone on a private mesh network. The Hetzner firewall stays completely empty — nothing inbound, no exposed SSH port, no fail2ban theater, no bot swarm hammering port 22 within an hour of boot. The server is unreachable except from devices you own. Setup is one install command on each end and signing in twice. [FILL: minutes it took you]

**Termius: the window.** An SSH client on the phone that doesn't fight you: persistent sessions, real keyboard shortcuts, snippets for the commands you type daily. iOS or Android, works the same.

**tmux: the memory.** The one non-negotiable. Claude Code runs inside a tmux session on the server, so when your phone sleeps, the elevator kills signal, or you just put it back in your pocket — the agent keeps working. You reattach an hour later and read what happened while you were gone. `tmux attach` is the whole ritual.

**Claude Code: the worker.** Runs on the server under your existing subscription. Same skills, same MCP servers, same repo access as your desk setup, because it IS your setup — you just moved it somewhere that never sleeps.

## What it actually feels like

The mental shift is bigger than the technical one. Coding from a phone sounds miserable because you're imagining *typing code* on glass. You're not. You're typing sentences.

A real session from this week: I'm away from my desk, I open Termius, attach to tmux, and type "run the bookmark pull, distill the new entries, and draft this week's posts." Then I put the phone away. The agent doesn't need me hovering — it needs me to make the two or three judgment calls it can't, and those fit on a phone screen better than a diff ever will.

The rhythm becomes: fire instruction → pocket → check in ten minutes → make the call → pocket. It's closer to managing than typing, which is what working with agents already was — the phone just makes it honest.

[FILL: one real moment — where you were the first time you shipped something real from the phone, and what it was]

## The security shape, because someone will ask

The box has no open ports. Not "SSH on a weird port" — none. Tailscale's WireGuard mesh is the only way in, and it authenticates devices, not passwords. If my phone is stolen, I revoke the device from the Tailscale admin panel and the thief has a brick pointed at nothing.

The agent has exactly the credentials the repo needs and nothing else. It can't reach my bank, my email, or my cloud console, because none of that lives on the box. Blast radius is one git repo that's backed up anyway.

Could I harden further? Sure. But "empty firewall + device mesh + minimal credentials" already beats the laptop I used to carry through airports.

## What I don't know yet, honestly

**The phone review problem is real.** Reading a 40-file diff on a 6-inch screen doesn't work. I approve *direction* from the phone; anything that needs line-by-line review waits for a real screen. Pretending otherwise would just mean rubber-stamping — and an agent with a rubber stamp is how you ship a disaster.

**Costs are small but not zero.** The box runs 24/7 whether I use it or not. [FILL: actual monthly all-in]. Against what it replaced — a laptop I felt chained to — I'll take it, but I've only run this for [FILL: days/weeks], so ask me about the bill in three months.

**Signal dependence.** tmux means dropped connections don't kill work, but starting anything new from a dead zone is still impossible. The setup removes the desk, not the network.

**I haven't stress-tested recovery.** If Hetzner eats the box tomorrow, my repos are on remotes and the setup is an hour to rebuild — in theory. I haven't rehearsed it. That's on the list, and until I've done the drill I'm not claiming the resilience story.

## What's next

The setup is now part of a bigger experiment: my content loop (the bookmark vault, the weekly drafts) runs on schedules, and the phone means I can review and steer it from anywhere. The desk is becoming the place I do deep review, not the place work happens.

If you build with agents and still can't leave your desk, the tools have outrun your setup.

---

## FORMATTING MAP (X Article editor)

**Cover image:** CAPTURE — your phone home screen or Termius session showing a live
tmux Claude Code session (crop status bar). The realness IS the cover. Do not generate.

**Bold:** "the era of 'I'll do it when I'm back at my desk' is just over" · "nothing
inbound" · "You're typing sentences." · "It's closer to managing than typing" ·
"the tools have outrun your setup"

**Italic:** *where* (para 2) · *direction* (phone review problem) · the tmux ritual
line "`tmux attach` is the whole ritual."

**Inline images:**
1. CAPTURE — Termius on your phone, attached tmux session with Claude Code mid-task.
   After "What it actually feels like" intro. (Blur any repo secrets in scrollback.)
2. CAPTURE — Tailscale admin panel showing the two devices (server + phone), machine
   names visible. After the security section's first paragraph.
3. CAPTURE — Hetzner firewall page showing zero inbound rules. Next to "no open ports".

## SUPPORTING TWEETS (quote-reposts of this article across the week)

**T1 — number hook (day 2, morning):**
```
My whole dev machine is a [FILL: €X/mo] server and the phone already in my pocket.

No open ports. No laptop. The agent works; I make the calls from wherever I am.

Full setup in the article ↓
```

**T2 — insight (day 4, evening):**
```
Coding from your phone sounds miserable because you imagine typing code on glass.

You're not. 𝗬𝗼𝘂'𝗿𝗲 𝘁𝘆𝗽𝗶𝗻𝗴 𝘀𝗲𝗻𝘁𝗲𝗻𝗰𝗲𝘀.

The agent needs judgment calls, not keystrokes. Those fit on a phone.
```

**T3 — contrarian (day 6, midday):**
```
Unpopular: the desk is becoming the place you REVIEW work, not where work happens.

Empty firewall. Tailscale mesh. tmux that never sleeps. Claude Code on a $5 box.

If you build with agents and can't leave your desk, your setup is behind your tools.
```
