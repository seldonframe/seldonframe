import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestSentMailVoiceProfile } from "../../../../src/lib/agents/voice-profile/ingest-sent-mail";

const ORG = "org_1";

test("happy path: fetches sent mail, distills, writes the brain note", async () => {
  const writeCalls: any[] = [];
  const r = await ingestSentMailVoiceProfile(
    {
      callTool: async (slug, args) => {
        assert.equal(slug, "GMAIL_FETCH_EMAILS");
        assert.equal(args.query, "in:sent");
        return {
          data: {
            messages: [
              { subject: "Re: quote", snippet: "Thanks so much for reaching out! Here's the quote." },
              { subject: "Follow up", snippet: "Just checking in on this — let me know if you have questions." },
            ],
          },
        };
      },
      distill: async (emails) => {
        assert.equal(emails.length, 2);
        return "## Voice profile\n\nTone: friendly and concise.";
      },
      writeNote: async (path, body, metadata) => {
        writeCalls.push({ path, body, metadata });
      },
    },
    { orgId: ORG },
  );

  assert.deepEqual(r, { ok: true, notePath: "voice-profiles/email.md" });
  assert.equal(writeCalls.length, 1);
  assert.equal(writeCalls[0].path, "voice-profiles/email.md");
  assert.equal(writeCalls[0].metadata.type, "voice-profile");
  assert.match(writeCalls[0].metadata.source, /^ingestion:sent-mail:\d{4}-\d{2}-\d{2}$/);
});

test("no gmail binding (callTool throws 'not configured') -> {ok:false, reason:'no_gmail'}", async () => {
  const r = await ingestSentMailVoiceProfile(
    {
      callTool: async () => {
        throw new Error("Composio is not configured for this workspace (no API key)");
      },
      distill: async () => "unused",
      writeNote: async () => {},
    },
    { orgId: ORG },
  );
  assert.deepEqual(r, { ok: false, reason: "no_gmail" });
});

test("empty sent mail -> {ok:false, reason:'no_sent_mail'}", async () => {
  const r = await ingestSentMailVoiceProfile(
    {
      callTool: async () => ({ data: { messages: [] } }),
      distill: async () => "unused",
      writeNote: async () => {
        throw new Error("should not be called");
      },
    },
    { orgId: ORG },
  );
  assert.deepEqual(r, { ok: false, reason: "no_sent_mail" });
});

test("tool error (generic) -> fail-soft, never throws", async () => {
  const r = await ingestSentMailVoiceProfile(
    {
      callTool: async () => {
        throw new Error("composio 500");
      },
      distill: async () => "unused",
      writeNote: async () => {},
    },
    { orgId: ORG },
  );
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "fetch_failed");
});

test("LLM distill error -> fail-soft, never throws", async () => {
  const r = await ingestSentMailVoiceProfile(
    {
      callTool: async () => ({ data: { messages: [{ subject: "s", snippet: "body" }] } }),
      distill: async () => {
        throw new Error("LLM down");
      },
      writeNote: async () => {},
    },
    { orgId: ORG },
  );
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "distill_failed");
});

test("privacy: sample snippets are truncated to <=500 chars before distill", async () => {
  const long = "x".repeat(2000);
  let seenLen = 0;
  await ingestSentMailVoiceProfile(
    {
      callTool: async () => ({ data: { messages: [{ subject: "s", snippet: long }] } }),
      distill: async (emails) => {
        seenLen = emails[0].snippet.length;
        return "## Voice profile";
      },
      writeNote: async () => {},
    },
    { orgId: ORG },
  );
  assert.ok(seenLen <= 500, `expected <=500, got ${seenLen}`);
});

test("re-run overwrites: writeNote called again with the same path", async () => {
  const paths: string[] = [];
  const deps = {
    callTool: async () => ({ data: { messages: [{ subject: "s", snippet: "hi" }] } }),
    distill: async () => "## Voice profile",
    writeNote: async (path: string) => {
      paths.push(path);
    },
  };
  await ingestSentMailVoiceProfile(deps, { orgId: ORG });
  await ingestSentMailVoiceProfile(deps, { orgId: ORG });
  assert.deepEqual(paths, ["voice-profiles/email.md", "voice-profiles/email.md"]);
});

test("writeNote throwing -> fail-soft, never throws", async () => {
  const r = await ingestSentMailVoiceProfile(
    {
      callTool: async () => ({ data: { messages: [{ subject: "s", snippet: "hi" }] } }),
      distill: async () => "## Voice profile",
      writeNote: async () => {
        throw new Error("db down");
      },
    },
    { orgId: ORG },
  );
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "write_failed");
});

test("tolerates a data-wrapped list under a different key (list/items)", async () => {
  const r = await ingestSentMailVoiceProfile(
    {
      callTool: async () => ({
        data: { items: [{ subject: "s", snippet: "hi there" }] },
      }),
      distill: async (emails) => {
        assert.equal(emails.length, 1);
        return "## Voice profile";
      },
      writeNote: async () => {},
    },
    { orgId: ORG },
  );
  assert.equal(r.ok, true);
});
