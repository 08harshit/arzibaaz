# ArziBaaz API — multi-stage image for the pnpm monorepo.
# Build context is the repository root:  docker build -t arzibaaz-api .
#
# Runtime configuration comes from environment variables (see apps/api/.env.example).
# Hosts such as Render/Railway/Fly inject PORT; set TRUST_PROXY=1 on them.

# ---------- build: install everything, compile contracts + API ----------
FROM node:22-alpine AS build
RUN npm install -g pnpm@11.7.0
WORKDIR /repo

# Manifests first so the dependency layer is cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @arzi-baaz/api...

COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @arzi-baaz/contracts build \
 && pnpm --filter @arzi-baaz/api build

# ---------- runtime: production dependencies + compiled output only ----------
FROM node:22-alpine AS runtime
RUN npm install -g pnpm@11.7.0
ENV NODE_ENV=production
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter @arzi-baaz/api...

COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/apps/api/dist apps/api/dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/apps/api/src/main.js"]
