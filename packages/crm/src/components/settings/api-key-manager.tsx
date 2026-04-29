"use client";

import { useState, useTransition } from "react";
import { Copy, Check, KeyRound, Trash2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { mintApiKeyAction, revokeApiKeyAction } from "@/lib/workspace/actions";

/**
 * P0-4: client-side wrapper around the mint / revoke server actions.
 *
 * Renders:
 *   - Generate form (name input + button)
 *   - One-time reveal panel after successful mint (the raw token shows
 *     once; refreshing the page hides it)
 *   - Existing-keys list with prefix + created-at + revoke button
 *
 * The reveal-once flow is critical for security — we never round-trip
 * the raw token to the server again, so leaking it via screenshot or
 * leaving it in browser history is the operator's only loss vector.
 */

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

interface MintedKey {
  token: string;
  prefix: string;
  name: string;
}

export function ApiKeyManager({ keys }: { keys: KeyRow[] }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<MintedKey | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleMint(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give the key a name (e.g. 'laptop' or 'ci').");
      return;
    }
    const formData = new FormData();
    formData.set("name", name.trim());
    startTransition(async () => {
      const result = await mintApiKeyAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRevealedKey({ token: result.token, prefix: result.prefix, name: result.name });
      setShowToken(true);
      setName("");
    });
  }

  function handleRevoke(id: string, displayName: string) {
    if (!confirm(`Revoke "${displayName}"? Anything using this key will start failing immediately.`)) {
      return;
    }
    const formData = new FormData();
    formData.set("tokenId", id);
    startTransition(async () => {
      const result = await revokeApiKeyAction(formData);
      if (!result.ok) {
        setError(result.error || "Revoke failed");
      }
    });
  }

  async function handleCopy() {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — operator can select + copy manually.
    }
  }

  return (
    <div className="space-y-4">
      {/* Generate form */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Generate a new key</h2>
        </div>

        <form onSubmit={handleMint} className="flex flex-col sm:flex-row gap-2 items-end">
          <div className="flex-1 w-full">
            <label
              htmlFor="api-key-name"
              className="block text-xs uppercase tracking-wide font-medium text-muted-foreground mb-1.5"
            >
              Key name
            </label>
            <input
              id="api-key-name"
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="laptop, ci, mcp-prod, …"
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="crm-button-primary inline-flex h-10 items-center px-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Generating…" : "Generate key"}
          </button>
        </form>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {revealedKey ? (
          <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  Save this key now — it's shown only once
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Refreshing the page hides it forever. We only store the hash;
                  losing the raw value means minting a fresh key.
                </p>
              </div>
            </div>

            <div className="flex items-stretch gap-2">
              <code className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground break-all">
                {showToken ? revealedKey.token : revealedKey.token.replace(/(.{8}).+/, "$1" + "•".repeat(40))}
              </code>
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="crm-button-secondary inline-flex h-auto items-center px-3 text-xs gap-1"
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="crm-button-primary inline-flex h-auto items-center px-3 text-xs gap-1"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </button>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                How to use this
              </summary>
              <div className="mt-2 space-y-2 pl-4">
                <p className="text-muted-foreground">
                  <strong className="text-foreground">For the MCP server:</strong>{" "}
                  set <code className="font-mono">SELDONFRAME_API_KEY</code> in your
                  shell:
                </p>
                <pre className="rounded-md border bg-background p-2 text-[11px] font-mono overflow-x-auto">
                  {`export SELDONFRAME_API_KEY=${revealedKey.token}\n# then restart Claude Code`}
                </pre>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">For direct API calls:</strong>
                </p>
                <pre className="rounded-md border bg-background p-2 text-[11px] font-mono overflow-x-auto">
                  {`curl -H "Authorization: Bearer ${revealedKey.token}" \\\n  https://app.seldonframe.com/api/v1/contacts`}
                </pre>
              </div>
            </details>

            <button
              type="button"
              onClick={() => setRevealedKey(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              I've saved it — dismiss
            </button>
          </div>
        ) : null}
      </div>

      {/* Existing keys */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Active keys ({keys.length})
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Sorted newest first. Prefix shown — full key never re-displayed.
          </p>
        </div>
        {keys.length === 0 ? (
          <div className="p-8 text-center">
            <KeyRound className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No API keys yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Generate one above to get programmatic access.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{k.name}</span>
                    <code className="text-xs font-mono text-muted-foreground">
                      {k.prefix}…
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? (
                      <>
                        {" · "}
                        Last used{" "}
                        {new Date(k.lastUsedAt).toLocaleDateString()}
                      </>
                    ) : (
                      " · Never used"
                    )}
                    {k.expiresAt ? (
                      <>
                        {" · "}
                        Expires {new Date(k.expiresAt).toLocaleDateString()}
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(k.id, k.name)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
