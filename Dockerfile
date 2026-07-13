# SeldonFrame — self-host image for the CRM app (dashboard + public sites + API).
# Build context is the repo root (the app is a pnpm workspace at packages/crm).
#
#   docker compose up            # recommended — brings up Postgres + Neon proxy + this app
#   docker build -t seldonframe .   # image only
#
# Two stages: `builder` installs the full workspace and runs `next build`;
# `runner` carries the built app + node_modules (drizzle-kit lives here too, so
# the compose `migrate` service can reuse this image). We copy the whole /app
# tree between stages so pnpm's relative workspace symlinks stay intact.

# ---------- builder ----------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# `next build` should not need real secrets — pages are dynamic/authed. The
# placeholders keep any module-load-time env reads happy; NEON_LOCAL_HOST is
# deliberately unset so the build path matches production (plain neon-http).
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    AUTH_SECRET=build-only-not-a-real-secret \
    NEXTAUTH_SECRET=build-only-not-a-real-secret \
    ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
    NEXT_PUBLIC_APP_URL=http://localhost:3000
RUN pnpm --filter @seldonframe/crm build

# ---------- runner ----------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production PNPM_HOME=/pnpm PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN corepack enable
WORKDIR /app

# curl for the compose healthcheck; tini for correct signal handling.
RUN apt-get update && apt-get install -y --no-install-recommends curl tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app ./

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "--filter", "@seldonframe/crm", "start"]
