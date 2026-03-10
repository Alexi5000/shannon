# file: ui/Dockerfile
# description: Shannon Web UI (HTTP 4005 + WebSocket 4006) for TechTide stack
# reference: server.ts, docker-compose.apps.yml in Molten

FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

COPY . .

EXPOSE 4005 4006

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:4005/health || exit 1

CMD ["bun", "run", "server.ts"]
