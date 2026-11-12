FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# One-shot database migrations (docker-compose.prod.yml runs this before the app starts).
FROM build AS migrate
CMD ["pnpm", "db:migrate"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    KERN_DATA_DIR=/data/kern COREPACK_HOME=/data/corepack
# The CMS works on git checkouts of the sites and runs their previews and builds with pnpm.
RUN apk add --no-cache git openssh-client \
    && corepack enable \
    && addgroup -S nodejs && adduser -S nextjs -G nodejs \
    && mkdir -p /data/kern /data/corepack && chown -R nextjs:nodejs /data
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
