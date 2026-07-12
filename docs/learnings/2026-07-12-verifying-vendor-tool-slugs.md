# Verifying vendor tool slugs when every doc-fetch surface is LLM-summarized/truncated

## The problem, in one line
Needed exact Composio action slugs (Gmail label/triage, Outlook move/update) to
widen `DEFAULT_TOOLS_BY_TOOLKIT` in
`packages/crm/src/lib/integrations/composio/catalog.ts`, but every way of
reading the vendor docs returned lossy answers: WebFetch converts + truncates
big pages (the Outlook toolkit page cuts off alphabetically inside the
`OUTLOOK_CREATE_*` range, so M–U slugs are invisible), and the summarizer model
happily "found" slugs that were not in the retrievable content.

## The approach
1. Fetch the vendor docs page once with a broad "list every slug" prompt to get
   the candidate set. Treat the result as CANDIDATES, not facts.
2. Detect truncation explicitly: ask the fetch "if the content cuts off
   mid-list, say so and name the last visible slug". If the last visible slug
   sorts alphabetically BEFORE the slug you need, every answer about that slug
   from this surface is worthless — positive or negative.
3. Cross-check each candidate with an exact-phrase web SEARCH (quoted string,
   e.g. `"OUTLOOK_UPDATE_EMAIL_MESSAGE" composio`). Search engines index the
   full page, so this sees past the fetch truncation. A hit on the vendor's own
   docs domain PLUS a returned tool-specific description (parameter names,
   constraints) = documented. Zero vendor hits for the exact phrase = strong
   evidence the slug does not exist.
4. Beware the substring trap: quoted search tokenizes underscores, so
   `"OUTLOOK_MOVE_MESSAGE"` also matches `OUTLOOK_MOVE_MESSAGE_FROM_FOLDER`.
   A prefix-of-other-slugs candidate needs its LONGER variants searched too
   before you trust the short form.
5. When a candidate stays ambiguous after all that, pick the nearest slug you
   saw VERBATIM in raw fetched content instead (here: `OUTLOOK_BATCH_MOVE_MESSAGES`,
   which moves 1–20 messages, carries single-message moves). A slightly clunkier
   confirmed tool beats an elegant guessed one — in this codebase an unknown
   slug wraps into a tool the model can call that always errors (see the
   warning comment above `DEFAULT_TOOLS_BY_TOOLKIT`).

## Judgment calls
- Did NOT add the ambiguous single-move slug (`OUTLOOK_MOVE_MESSAGE` vs
  `OUTLOOK_MOVE_MESSAGE_TO_FOLDER` — sources disagreed) even though one search
  summary asserted it exists. The file's contract is documented-actions-only;
  a wrong slug ships a permanently erroring tool to every compiled agent.
- Did NOT add `GMAIL_MOVE_TO_TRASH` or batch-delete actions: triage
  (label/archive/mark-read/move) is fully covered by label modification in
  Gmail, and destructive defaults violate the conservative-handful design.
- Did NOT try to bypass truncation with `.md` exports or per-tool URLs first —
  tried them, they truncate identically or 404; the search-index cross-check is
  the reliable channel. Recorded so the next session skips those dead ends.

## The reusable rule, one line
An LLM-summarized fetch of a truncated page can neither confirm nor deny an
identifier — establish where the content cuts off, then verify identifiers by
exact-phrase search against the vendor's own domain (watching for substring
matches), and prefer a verbatim-seen slug over an inferred one.
