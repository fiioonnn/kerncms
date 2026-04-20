FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p data && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 kern && \
    adduser --system --uid 1001 kern

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/src/db/migrate.ts ./src/db/migrate.ts
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/prebuild-install ./node_modules/prebuild-install
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
COPY --from=builder /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

RUN mkdir -p data public/kern/media && chown -R kern:kern data public/kern/media

USER kern
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD sh -c "node -e \"require('drizzle-orm/better-sqlite3/migrator').migrate(require('drizzle-orm/better-sqlite3').drizzle(require('better-sqlite3')('data/cms.db')),{migrationsFolder:'drizzle'})\" && node server.js"
