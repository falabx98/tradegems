FROM node:20.18-slim AS base
RUN corepack enable
WORKDIR /app

# Copy monorepo root files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy all workspace package.json files
COPY apps/workers/package.json apps/workers/
COPY packages/db/package.json packages/db/
COPY packages/game-engine/package.json packages/game-engine/
COPY packages/shared-types/package.json packages/shared-types/

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY packages/ packages/
COPY apps/workers/ apps/workers/

# Build
RUN npx turbo build --filter=@tradingarena/workers

# --- Production ---
FROM node:20.18-slim AS runner
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/workers ./apps/workers
COPY --from=base /app/package.json ./

WORKDIR /app/apps/workers
CMD ["node", "dist/index.js"]
