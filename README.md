# kerncms

Next.js 16 (App Router) · Tailwind CSS 4 · Base UI (headless) · Drizzle ORM + Postgres · S3 storage (RustFS)

## Setup

```bash
cp .env.example .env
pnpm install
```

## Development

```bash
pnpm dev
```

This starts Postgres and storage in Docker (waits until they are healthy and creates the bucket), then runs `next dev` locally. The containers keep running after you stop the dev server; stop them with `pnpm services:down`.

- App: http://localhost:3000
- S3 API: http://localhost:9000
- Storage console: http://localhost:9001 (credentials: `S3_ACCESS_KEY` / `S3_SECRET_KEY`)

## Eine Website verbinden

kerncms bearbeitet die Inhalte einer Astro-Website direkt in ihrem Git-Repository. Der Vertrag zwischen CMS und Website steht in [docs/kern-contract.md](docs/kern-contract.md); ein vollständiges Beispiel liegt in `~/Projects/example-astro-page`.

1. `pnpm dev` starten und http://localhost:3000 öffnen. Beim ersten Mal legst du das Inhaber-Konto an.
2. Unter „Website verbinden“ den Ordner des Repositorys angeben (z. B. `~/Projects/example-astro-page`).
3. kerncms legt einen Entwurfs-Branch `kern/draft` und einen eigenen Worktree unter `.kern-data/` an. Der visuelle Editor startet dort den Astro-Dev-Server der Website als Vorschau.
4. „Speichern“ committet auf `kern/draft`, „Veröffentlichen“ mergt in den Live-Branch (`main`) und baut die Website.

Formulare und die cookielose Statistik der Website senden an `/api/public/<site-id>/…`.

## Full stack in Docker

The Docker image runs the CMS only. Connecting a local repository and the live preview need `pnpm dev` on the host, because the CMS starts the site's dev server and works in its git repository.

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
