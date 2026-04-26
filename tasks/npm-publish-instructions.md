# npm publish — manual instructions for `@seldonframe/mcp` v1.0.0

**For:** Max
**When to run:** after `claude/publish-mcp-package` is merged to `main`
**Estimated time:** 10 minutes (5 min publish, 5 min verify)
**Per:** L-29 — distribution path must be tested end-to-end on a clean environment before any marketing claims reference it.

---

## Pre-flight (one-time setup if you haven't done this before)

### 1. Confirm npm account membership

Verify you're a member of the `seldonframe` npm org:

```bash
npm org ls seldonframe
```

You should see your username with role `owner` or `admin`. If you see `404 Not Found` or you're listed as `developer` only, contact whoever owns the org. (When this doc was written, `npm org ls seldonframe` returned at least one `owner` from a non-authenticated query — the org is claimed.)

### 2. Authenticate npm CLI

```bash
npm login
```

Use your npmjs.com credentials. After login, verify:

```bash
npm whoami    # should print your npm username
```

### 3. Enable 2FA for publish (recommended, not strictly required)

If you've never enabled 2FA, do it at <https://www.npmjs.com/settings/~/profile> first. With 2FA on, `npm publish` will prompt for an OTP code — copy it from your authenticator app.

---

## Publish flow

### Step 1 — Switch to the freshly-merged `main`

```bash
cd "/path/to/seldonframe"
git fetch origin
git checkout main
git pull origin main
```

Verify the merge commit for `claude/publish-mcp-package` is at HEAD:

```bash
git log --oneline -3
# Should show the merge commit referencing claude/publish-mcp-package
```

### Step 2 — `cd` into the package and verify package.json

```bash
cd skills/mcp-server
cat package.json | head -10
```

Expected (verbatim — confirm before publishing):

```json
{
  "name": "@seldonframe/mcp",
  "version": "1.0.0",
  ...
  "publishConfig": {
    "access": "public"
  }
}
```

If `name`, `version`, or `publishConfig` look wrong, **stop** and investigate before publishing — npm publishes are not trivially reversible (unpublish has a 72-hour window and creates a permanent name reservation).

### Step 3 — Dry-run the publish

```bash
npm publish --dry-run
```

Review the output:
- `package size` should be ~22 KB (matches the local `npm pack` from the publish-prep branch)
- `total files` should be 6 (`README.md`, `package.json`, `src/index.js`, `src/welcome.js`, `src/tools.js`, `src/client.js`)
- No surprise files (no `node_modules`, no `.env`, no `tasks/`, no `package-lock.json`)

If the file list looks wrong, **stop** — the `files` field in `package.json` (or an `.npmignore`) is misconfigured.

### Step 4 — Real publish

```bash
npm publish --access public
```

If 2FA is on, you'll be prompted for an OTP. Copy from your authenticator.

Successful output ends with:
```
+ @seldonframe/mcp@1.0.0
```

If you see `403 Forbidden`, common causes:
- Not logged in (`npm login` again)
- Not a member of `@seldonframe` org with publish rights
- Wrong scope or `publishConfig.access` not set to `public`

---

## Verify (mandatory — do not skip)

This is the L-29 cleanroom verification step. It must be performed in an environment that has never run SeldonFrame development.

### Option A — fresh GitHub Codespace (recommended, ~5 min)

1. Open <https://github.com/codespaces/new?repo=seldonframe/seldonframe&ref=main>
2. Create a new Codespace (DO NOT reuse an existing one — caches contaminate the test)
3. In the Codespace terminal:

```bash
# Verify package is live on npm
npm view @seldonframe/mcp
# Should show: name, version 1.0.0, dist-tags, etc.

# Install Claude Code (if not already there)
npm install -g @anthropic-ai/claude-code

# Set your Anthropic key (use the same key as your protocol test)
export ANTHROPIC_API_KEY=sk-ant-api03-...

# Register the MCP server using the canonical command
claude mcp add seldonframe -- npx -y @seldonframe/mcp

# Start Claude Code
claude
```

4. Inside the Claude Code session, verify the server connects:

```
/mcp
```

Expected: `seldonframe   ✓ Connected` (NOT `Failed to reconnect`).

5. Ask Claude to confirm tools are available:

```
What SeldonFrame tools do you have?
```

Expected: Claude lists at least `create_workspace`, `list_workspaces`, `query_brain` ... wait, that's stale. Should list `create_workspace`, `get_workspace_snapshot`, `install_caldiy_booking`, `install_formbricks_intake`, etc. (75 tools total).

6. Smoke-test a tool call:

```
create_workspace({ name: "Cleanroom Test" })
```

Expected: Claude responds with workspace details — a `wsp_*` ID and live URLs at `cleanroom-test.app.seldonframe.com`.

### Option B — fresh OS user account on your machine (~10 min)

Same flow as Option A, but in a brand-new OS user. Slower setup, but works without internet for the npm prereqs (Codespaces sometimes has slow startup on first launch).

---

## After verify passes

✅ **Reply `npm publish confirmed + cleanroom verified` in the active branch's PR / chat thread.**

This unblocks Branch 2 (`claude/fix-marketing-install`) — the marketing-copy update that points all five user-facing surfaces (landing page hero + How-it-works step 1, `/docs/quickstart`, README) at the working install command.

**Per L-29 + Max's two-branch sequencing rule:** marketing copy must NOT change until the npm package is live AND the install command has been verified to work in a cleanroom. Otherwise the marketing surfaces re-introduce the same launch-blocker for any user who reads the new copy before the package is live.

---

## If something goes wrong

| Symptom | Likely cause | Action |
|---|---|---|
| `403 Forbidden` on publish | Not logged in, or not a member of the org | `npm login` and verify `npm org ls seldonframe` |
| `EPUBLISHCONFLICT` / "version already exists" | Someone (or a previous attempt) already published 1.0.0 | Bump to `1.0.1` in `package.json` and republish |
| `npm view @seldonframe/mcp` returns 404 after publish | Registry propagation delay (rare) | Wait 60 seconds, retry. If still 404 after 5 min, escalate. |
| `claude mcp add` succeeds but `/mcp` shows `Failed to reconnect` | npx download or server boot failed | In Codespace: `npx -y @seldonframe/mcp < /dev/null` to see the actual error |
| Server boots but tool calls return network errors | `app.seldonframe.com/api/v1` unreachable from the Codespace | Verify `https://app.seldonframe.com` is up; check firewall / VPN |

## Rollback

If the package is published but unusable and you need to take it offline:

```bash
npm unpublish @seldonframe/mcp@1.0.0    # only works within 72h of publish
```

After 72h, you cannot unpublish — you must publish a new version. Mark the bad version as deprecated:

```bash
npm deprecate @seldonframe/mcp@1.0.0 "Broken — use 1.0.1+"
```

Then publish 1.0.1 with the fix.

---

*Doc generated by `claude/publish-mcp-package`. Update this file if the publish process changes.*
