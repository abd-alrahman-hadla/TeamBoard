# syntax=docker/dockerfile:1
# TeamBoard web (Next.js standalone server). Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=/api -t teamboard-web .
# NEXT_PUBLIC_* values are inlined at build time, so they are build args, not runtime env.

FROM node:24-slim AS build
ENV CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter . --filter "@teamboard/web..."

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_SOCKET_URL=
ARG NEXT_PUBLIC_DEMO_MODE=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_OUTPUT=standalone

COPY tsconfig.base.json eslint.config.base.mjs ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @teamboard/shared build \
 && pnpm --filter @teamboard/web build

FROM node:24-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# The standalone output mirrors the monorepo layout: the server lives at apps/web/server.js.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
