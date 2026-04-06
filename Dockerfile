# ── Stage 1: build dependencies ──────────────────────────
FROM node:18-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production

# ── Stage 2: runtime image ───────────────────────────────
FROM node:18-alpine AS runner
WORKDIR /app

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./

USER appuser

EXPOSE 3001

ENV NODE_ENV=production \
    PORT=3001

CMD ["node", "server.js"]
