// OpenAI ChatGPT Apps — domain-ownership verification for app.seldonframe.com.
//
// The OpenAI app-submission flow ("Domain verification") fetches this well-known
// URL and checks the response body equals the challenge token it issued. The
// token is a PUBLIC proof-of-ownership value (NOT a secret) — it only proves we
// control this domain, so it is safe to serve verbatim and to commit.
//
//   GET https://app.seldonframe.com/.well-known/openai-apps-challenge  →  <token>

const OPENAI_APPS_CHALLENGE_TOKEN = "qcgP6DBY0NSMbpgeJr6Jsoavf3R4eliKAgPCRjXm-ao";

export const dynamic = "force-static";

export function GET() {
  return new Response(OPENAI_APPS_CHALLENGE_TOKEN, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
