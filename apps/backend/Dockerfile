# AiVillage backend (Express + Socket.IO on :4000).
# Build from the REPO ROOT:  docker build -f apps/backend/Dockerfile .
#
# The backend runs TypeScript directly with tsx, and applies the database
# schema with drizzle-kit on every start. Both are devDependencies, so this
# image installs the backend's full dependency set (dev included).

ARG NODE_IMAGE=node:22-alpine

# ---- base: Node + pnpm 9 (same major as pnpm-lock.yaml) ----
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ---- deps: install only the backend and the workspace packages it uses ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=aivillage-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@aivillage/backend..."

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps --chown=node:node /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --chown=node:node package.json tsconfig.base.json ./
COPY --chown=node:node packages/shared ./packages/shared
COPY --chown=node:node apps/backend ./apps/backend

USER node
WORKDIR /app/apps/backend
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

# 1) Apply the schema (non-interactive). 2) Start the server.
CMD ["sh", "-c", "./node_modules/.bin/drizzle-kit push --force && exec ./node_modules/.bin/tsx src/api/server.ts"]
