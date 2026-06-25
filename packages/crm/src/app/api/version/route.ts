// Deploy-verification endpoint. Returns the git commit SHA Vercel built this
// deployment from (VERCEL_GIT_COMMIT_SHA, injected into the function runtime),
// so "is my push actually live yet?" is one curl instead of inferring from
// behavior. Public, no auth, no DB — just echoes build-time env.
//
//   GET /api/version → { sha, ref, deploymentId }

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
