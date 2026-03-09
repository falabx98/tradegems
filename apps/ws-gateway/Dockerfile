FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

# Copy monorepo root files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy all workspace package.json files
COPY apps/ws-gateway/package.json apps/ws-gateway/
COPY packages/shared-types/package.json packages/shared-types/

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY packages/shared-types/ packages/shared-types/
COPY apps/ws-gateway/ apps/ws-gateway/

# Build
RUN npx turbo build --filter=@tradingarena/ws-gateway

# --- Production ---
FROM node:20-slim AS runner
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/ws-gateway ./apps/ws-gateway
COPY --from=base /app/package.json ./

WORKDIR /app/apps/ws-gateway
EXPOSE 3001
CMD ["node", "dist/index.js"]
