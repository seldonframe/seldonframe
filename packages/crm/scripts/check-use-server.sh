#!/usr/bin/env bash
# v1.27.2 — guard against the bug class that broke v1.26.2 production.
#
# A "use server" file in Next.js Server Actions can ONLY export async
# functions. Re-exporting a const / type-erased value technically works
# in TypeScript (tsc passes) but `next build` rejects it during the
# page-data-collection step, AFTER the 45-second compile.
#
# This script catches the violation in <1 second so it never reaches CI.
#
# Run from packages/crm: bash scripts/check-use-server.sh
# Exit 0: clean. Exit 1: violation found.

set -euo pipefail

ROOT="${1:-src}"
violations=0

# Populate the file list via a temp file rather than a `< <(...)` process
# substitution. Some build environments (e.g. certain Vercel build machines)
# don't expose /dev/fd, which makes process substitution fail
# non-deterministically: "/dev/fd/NN: No such file or directory". A temp file
# is portable AND keeps `violations` in the parent shell — a naive pipe would
# run the while-loop in a subshell and silently lose the count.
filelist="$(mktemp)"
trap 'rm -f "$filelist"' EXIT
grep -rln "^[\"']use server[\"']" "$ROOT" 2>/dev/null > "$filelist" || true

while IFS= read -r f; do
  # Find any line that exports a value (not a type, not an async function).
  # Patterns we flag:
  #   export const X = ...
  #   export let X = ...
  #   export var X = ...
  #   export { X }            (re-export — usually a const or type-erased value)
  #   export default <non-async-function>
  #
  # Patterns we ALLOW:
  #   export async function X(...)
  #   export type X = ...
  #   export interface X { ... }
  #   export { type X }       (explicit type-only re-export)
  bad=$(grep -nE "^export (const |let |var )" "$f" || true)
  rexp=$(grep -nE "^export \{[^}]*\}" "$f" | grep -v "type " || true)

  if [ -n "$bad" ] || [ -n "$rexp" ]; then
    echo "✗ $f exports non-async-function values from a 'use server' file:"
    [ -n "$bad" ] && echo "$bad" | sed 's/^/    /'
    [ -n "$rexp" ] && echo "$rexp" | sed 's/^/    /'
    echo "  → next build will reject this. Move the value to a non-'use server' module"
    echo "    (or wrap in an async function) and re-import."
    echo
    violations=$((violations + 1))
  fi
done < "$filelist"

if [ "$violations" -gt 0 ]; then
  echo "✗ $violations 'use server' file(s) have invalid exports. See https://nextjs.org/docs/messages/invalid-use-server-value"
  exit 1
fi

echo "✓ All 'use server' files export only async functions / types."
