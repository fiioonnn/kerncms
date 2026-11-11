# kerncms

Next.js 16 (App Router) · Tailwind CSS 4 · Base UI (headless) · Drizzle ORM + Postgres · S3 storage (RustFS)

## Setup

```bash
cp .env.example .env
pnpm install
```

## Development

Start Postgres and storage in Docker, run the app locally:

```bash
docker compose up -d postgres storage storage-init
pnpm dev
```

- App: http://localhost:3000
- S3 API: http://localhost:9000
- Storage console: http://localhost:9001 (credentials: `S3_ACCESS_KEY` / `S3_SECRET_KEY`)

## Full stack in Docker

```bash
docker compose up -d --build
```

## Database

Tables live in `src/db/schema.ts`, the client in `src/db/index.ts`.

```bash
pnpm db:generate   # create a migration from the schema
pnpm db:migrate    # apply migrations
pnpm db:push       # push the schema directly (prototyping)
pnpm db:studio     # Drizzle Studio
```

## Storage

`src/lib/s3.ts` exports a preconfigured `S3Client` and the bucket name. The bucket is created by the `storage-init` service.

## UI

Headless primitives come from [`@base-ui/react`](https://base-ui.com); styled wrappers go in `src/components/ui` (see `button.tsx`). Use `cn()` from `src/lib/utils.ts` to merge classes.
