# Call It Relayer — Multi-stage Dockerfile for Fly.io deployment
# Build context: monorepo root (required for pnpm workspace symlinks)
#
# Stage 1 (builder): installs all deps + compiles TypeScript → dist/
# Stage 2 (runner):  copies only dist/ + production node_modules; non-root USER node
#
# Fly.io deploy: plan 00-05 wires the GH Actions workflow that runs `flyctl deploy`
# Phase 4 note: if Playwright CEX scrapers push memory, bump memory_mb to 2048 in fly.toml

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm globally (same version as pinned in package.json)
RUN npm install -g pnpm@11.0.8

# Copy workspace manifests first (layer cache optimization)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy package manifests for workspace packages
COPY apps/relayer/package.json ./apps/relayer/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/

# Install ALL dependencies (including devDeps for TypeScript compilation)
RUN pnpm install --frozen-lockfile

# Copy source code for packages needed by the relayer
COPY apps/relayer/ ./apps/relayer/
COPY packages/shared/ ./packages/shared/
COPY packages/config/ ./packages/config/

# Build shared package first (relayer depends on it)
RUN pnpm --filter @call-it/shared run build

# Compile the relayer TypeScript → dist/
RUN pnpm --filter @call-it/relayer run build

# ─── Stage 2: runner ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Security: non-root user (node user is created by the node:22-alpine base image)
WORKDIR /app

# Install pnpm for runtime workspace resolution (needed for workspace: symlinks)
RUN npm install -g pnpm@11.0.8

# Copy package manifests for workspace dependency resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/relayer/package.json ./apps/relayer/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/

# Install ONLY production dependencies
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod

# Copy compiled artifacts from builder stage
COPY --from=builder /app/apps/relayer/dist ./apps/relayer/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Entrypoint: materializes GCP ADC from the GCP_SA_KEY_B64 Fly secret at boot
# (so @google-cloud/secret-manager + @google-cloud/kms can authenticate at runtime)
COPY apps/relayer/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Non-root runtime (security best practice, T-00-16)
USER node

EXPOSE 8080

# Health check matches fly.toml [[services.http_checks]]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Entrypoint decodes GCP creds (if GCP_SA_KEY_B64 is set) then exec's the node process
CMD ["/app/entrypoint.sh"]
