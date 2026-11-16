# syntax=docker/dockerfile:1
# TeamBoard API. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t teamboard-api .                      # runtime (default)
#   docker build -f apps/api/Dockerfile --target migrator -t teamboard-api-migrator .
# Multi-stage: `build` compiles everything, `migrator` runs `prisma migrate deploy`, and the
# runtime stage holds only dist/ plus production dependencies, running as the non-root `node` user.

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
# Production-only node_modules with @teamboard/shared copied in (not symlinked).
# @prisma/client's auto-installed peer drags in the Prisma CLI (+ Studio, pglite, effect, TypeScript).
# Nothing at runtime loads them (migrations run in the migrator image), so drop ~165 MB.
RUN pnpm --filter @teamboard/api deploy --legacy --prod /out \
 && rm -rf /out/src /out/test /out/scripts /out/Dockerfile* /out/*.mjs /out/tsconfig*.json /out/nest-cli.json \
 && cp -r apps/api/dist /out/dist \
 && cd /out/node_modules/.pnpm \
 && rm -rf prisma@* @prisma+studio-core@* @electric-sql+pglite@* effect@* typescript@* \
 && find /out/node_modules -xtype l -delete

# One-shot job: apply pending migrations, then exit. Has the Prisma CLI and the migrations.
FROM build AS migrator
WORKDIR /repo/apps/api
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
