FROM oven/bun:1.1 AS deps
WORKDIR /app
COPY package.json bun.lock* turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/bot/package.json packages/bot/package.json
COPY packages/web/package.json packages/web/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/app/data/nerif.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["bun", "--cwd", "packages/bot", "run", "start"]
