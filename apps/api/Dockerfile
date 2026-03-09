FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

# Copy monorepo root files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy all workspace package.json files
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/game-engine/package.json packages/game-engine/
COPY packages/shared-types/package.json packages/shared-types/

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY packages/ packages/
COPY apps/api/ apps/api/

# Build
RUN npx turbo build --filter=@tradingarena/api

# --- Production ---
FROM node:20-slim AS runner
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/api ./apps/api
COPY --from=base /app/package.json ./

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
