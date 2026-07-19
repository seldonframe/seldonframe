# Manual transcript drop folder

When the automated transcript fetch is blocked (YouTube throttles the free
services often), this is the reliable path:

1. Paste the video URL into <https://notegpt.io/youtube-transcript-generator>.
2. Copy the generated transcript.
3. Save it here as `<channel>-<short-slug>.md`, with the **source URL on the
   first line** (so citations stay honest), then the transcript below it.

The `information-gain` skill checks this folder BEFORE trying to fetch, so
anything you drop here is used directly. Delete a file once its story has been
published (or keep it — it's a source archive).

Curate the channels you mine in [`../youtube-sources.md`](../youtube-sources.md).
