# AiVillage web app (Next.js 14, production build, serves on :3000).
# Build from the REPO ROOT:  docker build -f apps/web/Dockerfile .
#
# NEXT_PUBLIC_API_URL is the backend address AS SEEN FROM THE PLAYER'S BROWSER.
# Next.js bakes it into the JS bundle at build time, so changing it needs a
# rebuild (docker compose up -d --build).

ARG NODE_IMAGE=node:22-alpine

# ---- base: Node + pnpm 9 (same major as pnpm-lock.yaml) ----
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/

# ---- build: all web deps (dev included) + next build ----
FROM base AS build
RUN --mount=type=cache,id=aivillage-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@aivillage/web..."
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm --filter @aivillage/web build && rm -rf apps/web/.next/cache

# ---- prod-deps: only what `next start` needs ----
# The SWC compiler (~240 MB) is only used by `next build`, so it is removed.
FROM base AS prod-deps
RUN --mount=type=cache,id=aivillage-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@aivillage/web..." \
 && rm -rf node_modules/.pnpm/@next+swc-*

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=node:node /app/packages/shared/src ./packages/shared/src
COPY --from=build --chown=node:node /app/apps/web/package.json /app/apps/web/next.config.mjs ./apps/web/
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /app/apps/web/.next ./apps/web/.next

USER node
WORKDIR /app/apps/web
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

CMD ["sh", "-c", "exec ./node_modules/.bin/next start -H 0.0.0.0 -p ${PORT}"]
