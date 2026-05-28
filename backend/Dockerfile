# syntax=docker/dockerfile:1
FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=9000
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json ./package.json
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src
EXPOSE 9000
CMD ["bun", "run", "src/index.ts"]
