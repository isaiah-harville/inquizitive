# syntax=docker/dockerfile:1
# Inquizitive server image: Next.js standalone server (UI + API) on Node.
# Data lives in /data by default (SQLite + images); point DATABASE_URL at
# PostgreSQL and STORAGE_DRIVER=s3 at object storage to run several replicas.

FROM node:24-alpine AS build
COPY --from=oven/bun:1.4-alpine /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:server

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=sqlite:/data/inquizitive.db \
    STORAGE_DRIVER=fs \
    STORAGE_DIR=/data/media
RUN addgroup -S inquizitive && adduser -S -G inquizitive -u 10001 inquizitive \
 && mkdir -p /data && chown inquizitive:inquizitive /data
COPY --from=build --chown=inquizitive:inquizitive /app/.next/standalone ./
COPY --from=build --chown=inquizitive:inquizitive /app/.next/static ./.next/static
COPY --from=build --chown=inquizitive:inquizitive /app/public ./public
USER inquizitive
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ >/dev/null || exit 1
CMD ["node", "server.js"]
