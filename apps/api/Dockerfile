# TeamBoard API image. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t teamboard-api:local .
# Used by the `scale` docker-compose profile (2 replicas behind nginx).

FROM node:24-slim AS build
ENV CI=true
RUN corepack enable
WORKDIR /repo

# Manifests first so the dependency layer is cached across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The root (TypeScript, used by nest build) plus the API and its workspace dependencies.
RUN pnpm install --frozen-lockfile --filter . --filter "@teamboard/api..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @teamboard/shared build \
 && pnpm --filter @teamboard/api generate \
 && pnpm --filter @teamboard/api build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
