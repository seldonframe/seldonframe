# Hetzner devbox runbook — build SeldonFrame from your phone

A 24/7 Linux box that (a) runs the scheduled agents even when your PC is off,
(b) runs the REAL `next build` locally (impossible on the Windows machine),
(c) lets you drive Claude Code from an iPhone over Tailscale.

Security stance (differs from levelsio's "hobby server, no important stuff"
because this touches the production company repo):

- **Tailscale-only.** Hetzner firewall: zero inbound rules. Nothing listens publicly.
- **Machine user, not your PAT — and NOT a deploy key.** The box pushes as a
  dedicated non-admin GitHub account (`seldonframe-devbox`, Write role). A
  GitHub ruleset requires PRs on `main`, so an unattended agent can push
  branches but only a human merges. ⚠️ Learned 2026-07-09 the hard way: **deploy
  keys silently BYPASS rulesets** ("Bypassed rule violations" — they aren't
  even eligible bypass actors), so a write deploy key CAN push protected main.
  Machine users are governed like any user; the rejection is real and tested.
- **No crown-jewel secrets on the box.** Stripe/Twilio/Neon-prod/Vercel tokens
  stay in Vercel. The box gets: the machine user's SSH key + gh token,
  `DATAFORSEO_AUTH_B64`, a SENDING-ONLY Resend key (`RESEND_SENDING_KEY` —
  recap emails; revocable, cannot read the account), and your Claude login.
  That's the whole list.

Total time: ~30 minutes. Steps 1–2 from any browser; the rest from a terminal
(or paste this file into a fresh Claude session on the box and let it drive).

---

## 1. Provision (Hetzner console, 5 min)

1. https://console.hetzner.cloud → New project `seldonframe-devbox` → Add server.
2. Location: `ash` (Ashburn, US-East — closest to Vercel iad1 + your users) or `nbg1` (cheaper EU).
3. Image: **Ubuntu 24.04**. Type: **CX32 / CPX31 class — 4 vCPU, 8 GB RAM** (~€7/mo).
   Do NOT take 4 GB; `next build` on this monorepo will OOM.
4. SSH key: paste your public key (Termius can generate one on the phone:
   Keychain → + → Generate; or on the PC: `ssh-keygen -t ed25519`).
5. Create. Note the public IPv4 — you'll use it exactly once (step 2), then never again.

## 2. Tailscale first, then close the door (5 min)

```bash
ssh root@<PUBLIC_IP>

# Tailscale with Tailscale-SSH enabled (auth via your tailnet, not sshd)
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --ssh --hostname seldonframe-devbox
# → open the printed login URL on your phone, approve the machine
tailscale ip -4   # note the 100.x.y.z address
```

Then in the Hetzner console → Firewalls → create `no-inbound` with **zero inbound
rules** (outbound open) and apply it to the server. Tailscale punches out; nothing
comes in. From now on connect with `ssh root@seldonframe-devbox` from any device
on your tailnet. In the Tailscale admin console (Machines → devbox → …):
**Disable key expiry**.

Baseline hardening (Ubuntu ships most of this, make it explicit):

```bash
apt update && apt -y upgrade
apt -y install unattended-upgrades tmux git jq
dpkg-reconfigure -plow unattended-upgrades   # accept
```

(`fail2ban` is optional — with zero inbound there is nothing for it to watch.)

## 3. Node 24 + pnpm + Claude Code (5 min)

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt -y install nodejs
corepack enable && corepack prepare pnpm@latest --activate
npm install -g @anthropic-ai/claude-code
claude   # → log in with the Claude MAX subscription (browser link flow), then exit
```

## 4. Repo access: machine user + PR-required ruleset (15 min)

**On the box:**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/seldonframe_deploy -N "" -C "devbox-bot"
cat ~/.ssh/seldonframe_deploy.pub
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/seldonframe_deploy
  IdentitiesOnly yes
EOF
```

**On GitHub:**

1. **Create the machine user** (a human must do this — GitHub ToS allows a
   single machine user, forbids bot-registered accounts): new account, e.g.
   `seldonframe-devbox` with a devbox@ email alias.
2. As an org admin: repo Settings → Collaborators → **invite the machine user
   with the Write role** (NOT admin — Write users can't bypass rulesets).
   Accept the invite from the machine user's account.
3. Logged in AS the machine user: Settings → SSH and GPG keys → New SSH key →
   paste the pubkey from above. (This is a USER key on the bot account — not a
   repo deploy key; see the warning in the security stance.)
4. Settings → Rules → Rulesets → New branch ruleset:
   - Name `protect-main`, Enforcement **Active**, Target branch: Include `main`.
   - Rules: ✅ **Require a pull request before merging** (0 approvals is fine —
     the point is a human click, not review theater).
   - Bypass list: add **Repository admin** — your own sessions keep pushing
     main exactly as today; the machine user has Write, not admin, so the box
     genuinely cannot (expected error: `GH013 ... Changes must be made through
     a pull request`).
5. Leave the org's `deploy_keys_enabled_for_repositories` setting **disabled**.

**Back on the box:**

```bash
git clone git@github.com:seldonframe/seldonframe.git ~/seldonframe
cd ~/seldonframe
pnpm install                      # full install — several minutes first time

# 4 GB swapfile FIRST — next build peaks past ~7 GB and gets OOM-killed
# (exit 137) on the 8 GB box without it. Learned 2026-07-09.
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# the payoff: the REAL build gate, locally, for the first time
cd packages/crm && pnpm build     # bash check-use-server + next build
```

Expect `ssh -T git@github.com` to greet you as the machine user
(`Hi seldonframe-devbox!`), not the repo.

If `pnpm build` is green here, every future merge can be gated on a real
`next build` instead of trusting the Vercel preview.

Secrets file (the complete allowed list):

```bash
cat > ~/seldonframe/packages/crm/.env.local <<'EOF'
DATAFORSEO_AUTH_B64=<paste from your Windows packages/crm/.env.local>
EOF
chmod 600 ~/seldonframe/packages/crm/.env.local
```

Git identity for the agents' commits:

```bash
git config --global user.name  "SeldonFrame Devbox"
git config --global user.email "devbox@seldonframe.com"
```

## 5. Migrate the 3 scheduled agents to real cron (5 min)

The prompts live IN THE REPO at `docs/ops/agents/` (keyword-recon.md,
reddit-recon.md, seo-price-refresh.md) — the box always runs the latest
main version. One runner script:

```bash
mkdir -p ~/agents/logs
cat > ~/agents/run-agent.sh <<'EOF'
#!/usr/bin/env bash
# Usage: run-agent.sh <name>   (name = docs/ops/agents/<name>.md)
set -euo pipefail
# Claude Code refuses --dangerously-skip-permissions as root unless IS_SANDBOX
# is set. Deliberately relaxed on this dedicated, secret-free, main-protected box.
export IS_SANDBOX=1
NAME="$1"
REPO="$HOME/seldonframe"
LOG="$HOME/agents/logs/${NAME}-$(date +%F-%H%M).log"
cd "$REPO"
git fetch origin --quiet && git checkout --quiet --detach origin/main
# --model sonnet: recon/refresh work is volume-tier; do not burn Opus on it.
claude -p "$(cat "docs/ops/agents/${NAME}.md")" \
  --model sonnet --dangerously-skip-permissions \
  >> "$LOG" 2>&1
tail -5 "$LOG"
EOF
chmod +x ~/agents/run-agent.sh
```

Why `--dangerously-skip-permissions` is acceptable HERE and not on your PC:
the box's blast radius is bounded by design — the machine user can't touch main,
no prod secrets exist on the machine, and the whole box is disposable.

Crontab (server is UTC; 08:00 ET ≈ 12:00/13:00 UTC — times below keep the
original local-morning intent):

```bash
crontab -e
```

```cron
# m  h   dom mon dow  command
  0  12  *   *   1    $HOME/agents/run-agent.sh keyword-recon
  0  13  *   *   2,5  $HOME/agents/run-agent.sh reddit-recon
  0  13  1   *   *    $HOME/agents/run-agent.sh seo-price-refresh
```

**Then disable the three desktop scheduled tasks** (Claude desktop → Scheduled
sidebar → pause keyword-recon, reddit-recon, seo-price-refresh) so they don't
double-run. Keep them paused, not deleted, as fallback.

Smoke one immediately:

```bash
~/agents/run-agent.sh reddit-recon
```

## 6. Phone setup (5 min)

- **Termius** (iOS): add host `seldonframe-devbox` (the tailnet name), user
  `root`, your SSH key. Install the Tailscale iOS app, log in — the phone joins
  the tailnet and Termius connects from anywhere.
- **tmux is the session that survives pocketing the phone:**
  ```bash
  tmux new -s main      # first time
  tmux attach -t main   # every time after
  ```
  Run `claude` inside tmux; disconnects don't kill it; agents keep going all night.
- Alternative: `/remote-control` in a session on the box lets the Claude iOS app
  pick it up without a terminal at all.
- Interactive phone sessions: run plain `claude` (normal permissions). The
  skip-permissions flag is reserved for the cron runner.

## 7. Verify (the definition of done)

- [ ] `ssh root@seldonframe-devbox` works from the phone with public IP access removed (Hetzner firewall shows 0 inbound rules)
- [ ] `cd ~/seldonframe/packages/crm && pnpm build` → green (the real build gate)
- [ ] `git push origin HEAD:main` from the box → **rejected** with `GH013 ... pull request` and NO "Bypassed" in the output (this failing is success; a "Bypassed rule violations" success means you used a deploy key — go back to step 4)
- [ ] `git push origin HEAD:refs/heads/test-devbox` → works; delete the branch after
- [ ] `~/agents/run-agent.sh reddit-recon` → produces a queue branch; log in `~/agents/logs/`
- [ ] Desktop scheduled tasks paused
- [ ] `claude` inside tmux from the phone: ask it to make a trivial branch commit, watch it push

## Maintenance

- Ubuntu + security patches: automatic (unattended-upgrades).
- Claude Code: `npm update -g @anthropic-ai/claude-code` monthly (or when a run
  complains); `claude doctor` if anything is odd.
- Disk: `pnpm store prune` + `rm -rf ~/agents/logs/*.log` older than a month.
- Rotate if the box is ever compromised: delete the SSH key from the machine
  user's account (and/or revoke its repo access) → generate a new one. Nothing
  else on the box needs rotating (no other secrets).
- The box is cattle: `docs/ops/hetzner-devbox.md` (this file) rebuilds it from
  zero in 30 minutes.
