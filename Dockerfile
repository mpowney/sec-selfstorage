# Multi-stage build for sec-selfstorage
# Supports linux/amd64 (macOS dev) and linux/arm64 (Raspberry Pi)

# ---- Frontend Build Stage ----
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---- Backend Build Stage ----
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine AS production
WORKDIR /app

# Install runtime dependencies for better-sqlite3 and su-exec for privilege drop
RUN apk add --no-cache python3 make g++ su-exec

# Copy backend dependencies and built files
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package.json ./backend/package.json

# Copy frontend built files to be served as static
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown node:node /app/data

# Copy entrypoint script (runs as root to fix bind-mount permissions, then drops to node)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app/backend

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
