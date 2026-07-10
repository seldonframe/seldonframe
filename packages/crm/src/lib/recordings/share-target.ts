// Shared constants for the Web Share Target flow.
//
// public/record-sw.js intercepts POST /record/share-target and stages the
// shared file in CacheStorage; record-client.tsx reads it back out via
// these same names. record-sw.js is a plain, unbundled script served
// directly from /public — it cannot `import` this module — so it
// duplicates these three literals verbatim in its own header comment.
// share-target.spec.ts pins the values here so any future edit to one side
// is at least caught as a diff against this file, even though a test can't
// reach into the worker script itself.
export const SHARE_TARGET_PATH = "/record/share-target";
export const SHARE_CACHE_NAME = "sf-record-share";
export const STAGED_RECORDING_CACHE_KEY = "/record/__staged-recording__";
