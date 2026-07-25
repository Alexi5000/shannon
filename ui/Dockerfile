# file: ui/Dockerfile
# description: Shannon Web UI (HTTP 4005 + WebSocket 4006) for TechTide stack
# reference: server.ts, docker-compose.apps.yml in Molten

FROM oven/bun:1.3.4-alpine@sha256:1d653098bf847813e26adb2435f932b7cfa3c132a7e25dd5216dbb1f67dbd118

WORKDIR /app

ENV SHANNON_HOST=0.0.0.0

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 4005 4006

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:4005/health || exit 1

USER bun

CMD ["bun", "run", "server.ts"]
