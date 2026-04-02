import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const url = new URL(request.url);
  const callbackUrl = url.searchParams.get("callbackUrl") ?? "/";

  const safeProvider = JSON.stringify(provider);
  const safeCallback = JSON.stringify(callbackUrl);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Redirecting...</title>
  </head>
  <body>
    <p>Redirecting...</p>
    <script>
      (async function () {
        try {
          const provider = ${safeProvider};
          const callbackUrl = ${safeCallback};
          const csrfResponse = await fetch('/api/auth/csrf', { cache: 'no-store' });
          if (!csrfResponse.ok) {
            window.location.href = '/signup';
            return;
          }
          const csrfData = await csrfResponse.json();
          if (!csrfData || !csrfData.csrfToken) {
            window.location.href = '/signup';
            return;
          }

          const form = document.createElement('form');
          form.method = 'POST';
          form.action = '/api/auth/signin/' + encodeURIComponent(provider);

          const csrfInput = document.createElement('input');
          csrfInput.type = 'hidden';
          csrfInput.name = 'csrfToken';
          csrfInput.value = csrfData.csrfToken;

          const callbackInput = document.createElement('input');
          callbackInput.type = 'hidden';
          callbackInput.name = 'callbackUrl';
          callbackInput.value = callbackUrl;

          form.appendChild(csrfInput);
          form.appendChild(callbackInput);
          document.body.appendChild(form);
          form.submit();
        } catch {
          window.location.href = '/signup';
        }
      })();
    </script>
    <noscript>
      <a href="/signup">Continue to sign in</a>
    </noscript>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
